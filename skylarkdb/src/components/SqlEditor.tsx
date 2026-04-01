import { useMemo, useRef, useState, useEffect } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { sql, MySQL } from '@codemirror/lang-sql';
import { basicSetup } from 'codemirror';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { completionKeymap } from '@codemirror/autocomplete';
import { MySQLTable, MySQLColumn, MySQLRoutine } from '@/types';
import { useSettings } from '@/hooks/useSettings';

function useDocumentDarkClass(): boolean {
  const [dark, setDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
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
    '.cm-placeholder': {
      color: 'hsl(215.4 16.3% 46.9%)',
    },
  },
  { dark: false }
);

const darkSqlTheme = EditorView.theme(
  {
    '&': {
      fontSize: '14px',
      backgroundColor: 'hsl(220 13% 12% / 0.6)',
    },
    '.cm-scroller': {
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
    },
    '.cm-gutters': {
      backgroundColor: 'hsl(220 13% 10% / 0.8)',
      color: 'hsl(215 15% 55%)',
      border: 'none',
      borderRight: '1px solid hsl(220 13% 20% / 0.5)',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '&.cm-focused .cm-cursor': {
      borderLeftColor: 'hsl(217 91% 65%)',
    },
    '&.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: 'hsl(217 91% 65% / 0.25)',
    },
    '.cm-placeholder': {
      color: 'hsl(215 15% 45%)',
    },
  },
  { dark: true }
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
  height?: string;
  minHeight?: string;
  showLineNumbers?: boolean;
  wordWrap?: boolean;
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
  height = '240px',
  minHeight = '120px',
  showLineNumbers: showLineNumbersProp,
  wordWrap: wordWrapProp,
}: SqlEditorProps) {
  const isDark = useDocumentDarkClass();
  const executeRef = useRef(onExecute);
  const { settings } = useSettings();
  executeRef.current = onExecute;

  // Use props if provided, otherwise fall back to settings
  const showLineNumbers = showLineNumbersProp ?? settings.showLineNumbers;
  const wordWrap = wordWrapProp ?? settings.wordWrap;

  const schema = useMemo(() => {
    const s: Record<string, string[]> = {};
    const tableNames = new Set(tables.map(t => t.name));
    for (const t of tables) {
      s[t.name] = tableColumns.get(t.name)?.map(c => c.name) ?? [];
    }
    for (const r of routines) {
      if (tableNames.has(r.name)) continue;
      const cols = r.parameters.map(p => p.name).filter((n): n is string => Boolean(n));
      s[r.name] = cols.length > 0 ? cols : ['(routine)'];
    }
    return s;
  }, [tables, tableColumns, routines]);

  const extensions = useMemo(() => {
    const exts = [
      basicSetup,
      EditorView.contentAttributes.of({ 'data-language': 'text/x-mysql' }),
      sql({
        dialect: MySQL,
        schema,
        upperCaseKeywords: false,
      }),
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
      isDark ? darkSqlTheme : lightSqlTheme,
    ];

    // Apply word wrap setting
    if (wordWrap) {
      exts.push(EditorView.lineWrapping);
    }

    // Apply line numbers setting
    if (showLineNumbers) {
      exts.push(lineNumbers());
    }

    return exts;
  }, [schema, isDark, wordWrap, showLineNumbers]);

  return (
    <div
      className={`rounded-xl border border-border/70 bg-background overflow-hidden shadow-sm focus-within:border-primary/60 focus-within:ring-4 focus-within:ring-primary/10 transition-all ${className ?? ''}`}
    >
      <CodeMirror
        value={value}
        height={height}
        minHeight={minHeight}
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
