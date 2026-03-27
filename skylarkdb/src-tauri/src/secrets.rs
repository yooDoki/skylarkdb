const SERVICE_NAME: &str = "SkylarkDB";

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

pub fn save_connection_password(connection_id: &str, password: &str) -> Result<(), String> {
    eprintln!(
        "[secrets] saving password for connection_id={} (len={})",
        connection_id,
        password.len()
    );
    password_entry(connection_id)
        .set_password(password)
        .map_err(|e| format!("保存密码到系统钥匙串失败: {}", e))?;
    let saved = get_connection_password(connection_id)?;
    eprintln!(
        "[secrets] save verification for connection_id={}: found={}",
        connection_id,
        saved.is_some()
    );
    if saved.is_none() {
        return Err(format!(
            "密码保存后未能从{}中读回，请检查该系统凭据存储是否允许当前应用访问",
            secure_store_name()
        ));
    }
    Ok(())
}

pub fn get_connection_password(connection_id: &str) -> Result<Option<String>, String> {
    eprintln!(
        "[secrets] reading password for connection_id={}",
        connection_id
    );
    match password_entry(connection_id).get_password() {
        Ok(password) => {
            eprintln!(
                "[secrets] read password for connection_id={}: found=true",
                connection_id
            );
            Ok(Some(password))
        }
        Err(keyring::Error::NoEntry) => {
            eprintln!(
                "[secrets] read password for connection_id={}: found=false",
                connection_id
            );
            Ok(None)
        }
        Err(error) => Err(format!("读取{}中的密码失败: {}", secure_store_name(), error)),
    }
}

pub fn require_connection_password(connection_id: &str) -> Result<String, String> {
    get_connection_password(connection_id)?.ok_or_else(|| {
        format!(
            "{}中没有找到该连接的已保存密码，请编辑连接后重新输入密码",
            secure_store_name()
        )
    })
}

pub fn delete_connection_password(connection_id: &str) -> Result<(), String> {
    eprintln!(
        "[secrets] deleting password for connection_id={}",
        connection_id
    );
    match password_entry(connection_id).delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("删除{}中的密码失败: {}", secure_store_name(), error)),
    }
}
