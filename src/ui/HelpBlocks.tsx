import { OTHER_KEYS, SHORTCUT_DOCS } from './helpShortcuts';
import type { HelpBlock } from './helpTypes';

const win = (keys: string): string => keys.replace(/Mod/g, 'Ctrl');
const mac = (keys: string): string => keys.replace(/Mod/g, 'Cmd').replace(/Alt/g, 'Option');

function ShortcutTable() {
  return (
    <>
      <table className="help-table" data-testid="help-shortcuts">
        <thead>
          <tr>
            <th scope="col">Action</th>
            <th scope="col">Windows / Linux</th>
            <th scope="col">Mac</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(SHORTCUT_DOCS).map(([id, d]) => (
            <tr key={id} data-shortcut={id}>
              <td>
                {d.what}
                {d.whenKeysSelected && <span className="help-note"> (while timeline keyframes are selected)</span>}
              </td>
              <td><kbd>{win(d.keys)}</kbd></td>
              <td><kbd>{mac(d.keys)}</kbd></td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4>Other keys and modifiers</h4>
      <dl className="help-rows">
        {OTHER_KEYS.map(([k, what]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

export default function HelpBlocks({ blocks }: { blocks: HelpBlock[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'p':
            return <p key={i}>{b.text}</p>;
          case 'list':
            return (
              <ul key={i}>
                {b.items.map((x) => <li key={x}>{x}</li>)}
              </ul>
            );
          case 'steps':
            return (
              <ol key={i}>
                {b.items.map((x) => <li key={x}>{x}</li>)}
              </ol>
            );
          case 'rows':
            return (
              <dl key={i} className="help-rows">
                {b.rows.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            );
          case 'shortcuts':
            return <ShortcutTable key={i} />;
        }
      })}
    </>
  );
}
