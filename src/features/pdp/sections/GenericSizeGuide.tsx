'use client';

import type { SizeGuide } from '@/features/pdp/types';

export function GenericSizeGuide({ sizeGuide }: { sizeGuide?: SizeGuide }) {
  if (!sizeGuide || !sizeGuide.columns.length || !sizeGuide.rows.length) {
    return null;
  }

  return (
    <div className="p-3">
      <h2 className="text-sm font-semibold mb-2">Size Guide</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border border-border rounded-lg overflow-hidden">
          <thead className="bg-muted">
            <tr>
              <th className="px-2.5 py-2 text-left">Size</th>
              {sizeGuide.columns.map((col) => (
                <th key={col} className="px-2.5 py-2 text-center">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sizeGuide.rows.map((row) => (
              <tr key={row.label}>
                <td className="px-2.5 py-2 font-medium">{row.label}</td>
                {sizeGuide.columns.map((col, idx) => (
                  <td key={`${row.label}-${col}`} className="px-2.5 py-2 text-center">
                    {row.values[idx] || '--'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">{sizeGuide.note || '* All measurements in inches'}</p>

      {sizeGuide.model_info ? (
        <div className="mt-2 p-2.5 bg-muted/50 rounded-lg">
          <p className="text-xs text-muted-foreground">{sizeGuide.model_info}</p>
        </div>
      ) : null}
    </div>
  );
}

