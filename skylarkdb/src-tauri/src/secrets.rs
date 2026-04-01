use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

static SERVICE_NAME: &str = "SkylarkDB";

// 密码缓存：连接 ID -> 密码
static PASSWORD_CACHE: Lazy<Arc<RwLock<HashMap<String, String>>>> =
    Lazy::new(|| Arc::new(RwLock::new(HashMap::new())));

fn password_entry(connection_id: &str) -> keyring::Entry {
    keyring::Entry::new(SERVICE_NAME, &format!("connection-password:{}", connection_id))
        .expect("failed to create keyring entry")
}

fn secure_store_name() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "macOS 钥匙串"
    }
    #[cfg(target_os = "windows")]
    {
        "Windows 凭据管理器"
    }
    #[cfg(target_os = "linux")]
    {
        "Linux 密钥环"
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        "系统凭据存储"
    }
}

/// 从缓存或钥匙串获取密码
/// 优先从缓存读取，避免每次访问钥匙串都弹出提示
pub async fn get_connection_password(connection_id: &str) -> Result<Option<String>, String> {
    // 先检查缓存
    {
        let cache = PASSWORD_CACHE.read().await;
        if let Some(password) = cache.get(connection_id) {
            eprintln!(
                "[secrets] cache hit for connection_id={}",
                connection_id
            );
            return Ok(Some(password.clone()));
        }
    }

    // 缓存未命中，从钥匙串读取
    eprintln!(
        "[secrets] reading password from keychain for connection_id={}",
        connection_id
    );
    match password_entry(connection_id).get_password() {
        Ok(password) => {
            eprintln!(
                "[secrets] read password for connection_id={}: found=true, caching...",
                connection_id
            );
            // 存入缓存
            {
                let mut cache = PASSWORD_CACHE.write().await;
                cache.insert(connection_id.to_string(), password.clone());
            }
            Ok(Some(password))
        }
        Err(keyring::Error::NoEntry) => {
            eprintln!(
                "[secrets] read password for connection_id={}: found=false",
                connection_id
            );
            Ok(None)
        }
        Err(error) => Err(format!("读取{}中的密码失败：{}", secure_store_name(), error)),
    }
}

/// 必须获取到密码，否则返回错误
pub async fn require_connection_password(connection_id: &str) -> Result<String, String> {
    get_connection_password(connection_id)
        .await?
        .ok_or_else(|| {
            format!(
                "{}中没有找到该连接的已保存密码，请编辑连接后重新输入密码",
                secure_store_name()
            )
        })
}

/// 保存密码到钥匙串和缓存
pub async fn save_connection_password(connection_id: &str, password: &str) -> Result<(), String> {
    eprintln!(
        "[secrets] saving password for connection_id={} (len={})",
        connection_id,
        password.len()
    );
    password_entry(connection_id)
        .set_password(password)
        .map_err(|e| format!("保存密码到系统钥匙串失败：{}", e))?;

    // 更新缓存
    {
        let mut cache = PASSWORD_CACHE.write().await;
        cache.insert(connection_id.to_string(), password.to_string());
    }

    eprintln!(
        "[secrets] saved and cached password for connection_id={}",
        connection_id
    );
    Ok(())
}

/// 从钥匙串和缓存中删除密码
pub async fn delete_connection_password(connection_id: &str) -> Result<(), String> {
    eprintln!(
        "[secrets] deleting password for connection_id={}",
        connection_id
    );
    match password_entry(connection_id).delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => {}
        Err(error) => {
            return Err(format!(
                "删除{}中的密码失败：{}",
                secure_store_name(),
                error
            ))
        }
    }

    // 清除缓存
    {
        let mut cache = PASSWORD_CACHE.write().await;
        cache.remove(connection_id);
    }

    eprintln!(
        "[secrets] deleted password from keychain and cache for connection_id={}",
        connection_id
    );
    Ok(())
}
