import { useMemo, useRef, useState, useEffect } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { sql, MySQL } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import { basicSetup } from 'codemirror';
import { EditorView, keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { completionKeymap } from '@codemirror/autocomplete';
import { MySQLTable, MySQLColumn, MySQLRoutine } from '@/types';

function useDocumentDarkClass(): boolean {
  const [dark, setDark] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => {
      setDark(el.classList.contains('dark'));
    });
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

const lightSqlTheme = EditorView.theme(
  {
    '&': {
      fontSize: '14px',
      backgroundColor: 'hsl(210 40% 96.1% / 0.45)',
    },
    '.cm-scroller': {
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
    },
    '.cm-gutters': {
      backgroundColor: 'hsl(210 40% 96.1% / 0.65)',
      color: 'hsl(215.4 16.3% 46.9%)',
      border: 'none',
      borderRight: '1px solid hsl(214.3 31.8% 91.4%)',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '&.cm-focused .cm-cursor': {
      borderLeftColor: 'hsl(221.2 83.2% 53.3%)',
    },
    '&.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: 'hsl(221.2 83.2% 53.3% / 0.2)',
    },
  },
  { dark: false }
);

export interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onExecute?: () => void;
  tables: MySQLTable[];
  tableColumns: Map<string, MySQLColumn[]>;
  /** 存储过程 / 函数，用于补全（与表名冲突时跳过） */
  routines?: MySQLRoutine[];
  placeholder?: string;
  className?: string;
}

export function SqlEditor({
  value,
  onChange,
  onExecute,
  tables,
  tableColumns,
  routines = [],
  placeholder = '输入 SQL 查询语句...',
  className,
}: SqlEditorProps) {
  const isDark = useDocumentDarkClass();
  const executeRef = useRef(onExecute);
  executeRef.current = onExecute;

  const schema = useMemo(() => {
    const s: Record<string, string[]> = {};
    const tableNames = new Set(tables.map((t) => t.name));
    for (const t of tables) {
      s[t.name] = tableColumns.get(t.name)?.map((c) => c.name) ?? [];
    }
    for (const r of routines) {
      if (tableNames.has(r.name)) continue;
      const cols = r.parameters
        .map((p) => p.name)
        .filter((n): n is string => Boolean(n));
      s[r.name] = cols.length > 0 ? cols : ['(routine)'];
    }
    return s;
  }, [tables, tableColumns, routines]);

  const extensions = useMemo(
    () => [
      basicSetup,
      EditorView.contentAttributes.of({ 'data-language': 'text/x-mysql' }),
      sql({
        dialect: MySQL,
        schema,
        upperCaseKeywords: false,
      }),
      EditorView.lineWrapping,
      keymap.of(completionKeymap),
      Prec.highest(
        keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              executeRef.current?.();
              return true;
            },
          },
        ])
      ),
      isDark ? oneDark : lightSqlTheme,
    ],
    [schema, isDark]
  );

  return (
    <div
      className={`rounded-lg border border-input overflow-hidden focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all ${className ?? ''}`}
    >
      <CodeMirror
        value={value}
        height="200px"
        minHeight="120px"
        theme="none"
        basicSetup={false}
        extensions={extensions}
        onChange={onChange}
        placeholder={placeholder}
        className="text-sm"
      />
    </div>
  );
}
