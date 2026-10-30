// Generates dashboards/rows.json: a v2 dashboard with ROWS rows (RowsLayout), each with PANELS TestData panels.
// node generate-dashboard.mjs [rows=22] [panelsPerRow=6]
import { writeFileSync } from 'node:fs';

const ROWS = Number(process.argv[2] ?? 22);
const PANELS = Number(process.argv[3] ?? 6);
const elements = {};
const rows = [];
let id = 1;
for (let r = 1; r <= ROWS; r++) {
  const items = [];
  for (let p = 0; p < PANELS; p++, id++) {
    const name = `panel-${id}`;
    elements[name] = {
      kind: 'Panel',
      spec: {
        id,
        title: `Row ${r} / panel ${p + 1}`,
        description: '',
        links: [],
        data: {
          kind: 'QueryGroup',
          spec: {
            queries: [{
              kind: 'PanelQuery',
              spec: {
                refId: 'A',
                hidden: false,
                query: { kind: 'DataQuery', group: 'grafana-testdata-datasource', version: 'v0', datasource: { name: 'testdata' }, spec: { scenarioId: 'random_walk', seriesCount: 3 } },
              },
            }],
            transformations: [],
            queryOptions: {},
          },
        },
        vizConfig: { kind: 'VizConfig', group: 'timeseries', version: '', spec: { options: {}, fieldConfig: { defaults: {}, overrides: [] } } },
      },
    };
    // 6 panels per row: 3 x (w=8,h=6), then 1 x (w=24,h=8), then 2 x (w=12,h=6)
    const layout = [[0, 0, 8, 6], [8, 0, 8, 6], [16, 0, 8, 6], [0, 6, 24, 8], [0, 14, 12, 6], [12, 14, 12, 6]][p % 6];
    items.push({ kind: 'GridLayoutItem', spec: { x: layout[0], y: layout[1] + 20 * Math.floor(p / 6), width: layout[2], height: layout[3], element: { kind: 'ElementReference', name } } });
  }
  rows.push({ kind: 'RowsLayoutRow', spec: { title: `Row title ${r}`, collapse: false, layout: { kind: 'GridLayout', spec: { items } } } });
}

const dashboard = {
  apiVersion: 'dashboard.grafana.app/v2',
  kind: 'Dashboard',
  metadata: { name: 'rows-first-paint' },
  spec: {
    title: `RowsLayout first paint (${ROWS} rows x ${PANELS} panels)`,
    annotations: [], cursorSync: 'Off', editable: true, links: [], liveNow: false, preload: false, tags: [], variables: [],
    timeSettings: { from: 'now-6h', to: 'now', autoRefresh: '', autoRefreshIntervals: ['5s', '1m'], fiscalYearStartMonth: 0, hideTimepicker: false, timezone: 'browser' },
    elements,
    layout: { kind: 'RowsLayout', spec: { rows } },
  },
};
writeFileSync(new URL('./dashboards/rows.json', import.meta.url), JSON.stringify(dashboard, null, 2) + '\n');
console.log(`dashboards/rows.json: ${ROWS} rows, ${ROWS * PANELS} panels`);
