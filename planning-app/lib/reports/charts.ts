export interface ChartPoint { label: string; value: number | null | undefined; secondary?: number | null | undefined; lower?: number | null | undefined; upper?: number | null | undefined }
export interface ChartSlice { label: string; value: number | null | undefined; color?: string }

const BLUE = '#168CFF';
const LIGHT_BLUE = '#47B5FF';
const MUTED = '#929AA8';
const SURFACE = '#0D1016';

/** Escape all dynamic SVG text and attributes. */
export function escapeSvg(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function emptyChart(message: string, width: number, height: number, title: string): string {
  return `<svg class="report-chart" role="img" aria-label="${escapeSvg(title)}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" rx="10" fill="${SURFACE}"/><text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="${MUTED}" font-size="13">${escapeSvg(message)}</text></svg>`;
}

/** A compact, deterministic line chart. Values must already come from an analysis result. */
export function renderLineChartSvg(points: ChartPoint[], options: { title: string; valueLabel?: (value: number) => string; width?: number; height?: number } ): string {
  const width = options.width ?? 640;
  const height = options.height ?? 240;
  const valid = points.map((point, index) => ({ ...point, index, value: numberValue(point.value) })).filter((point): point is ChartPoint & { index: number; value: number } => point.value !== null);
  if (!valid.length) return emptyChart('No analysis data was supplied for this chart.', width, height, options.title);
  const values = valid.map((point) => point.value);
  const min = Math.min(0, ...values);
  const max = Math.max(...values, min + 1);
  const x = (index: number) => 44 + (points.length <= 1 ? 0 : (index / (points.length - 1)) * (width - 64));
  const y = (value: number) => 22 + (1 - (value - min) / (max - min)) * (height - 62);
  const polyline = valid.map((point) => `${x(point.index).toFixed(2)},${y(point.value).toFixed(2)}`).join(' ');
  const labels = points.filter((_, index) => points.length <= 6 || index === 0 || index === points.length - 1 || index % Math.ceil(points.length / 5) === 0)
    .map((point, index) => `<text x="${x(points.indexOf(point)).toFixed(2)}" y="${height - 14}" text-anchor="middle" fill="${MUTED}" font-size="10">${escapeSvg(point.label)}</text>`).join('');
  const circles = valid.map((point) => `<circle cx="${x(point.index).toFixed(2)}" cy="${y(point.value).toFixed(2)}" r="3.5" fill="${BLUE}"><title>${escapeSvg(`${point.label}: ${options.valueLabel ? options.valueLabel(point.value) : point.value}`)}</title></circle>`).join('');
  return `<svg class="report-chart" role="img" aria-label="${escapeSvg(options.title)}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" rx="10" fill="${SURFACE}"/><path d="M44 22V${height - 42}H${width - 20}" stroke="#3A4352" fill="none"/><text x="8" y="28" fill="${MUTED}" font-size="10">${escapeSvg(options.valueLabel ? options.valueLabel(max) : max)}</text><text x="8" y="${height - 45}" fill="${MUTED}" font-size="10">${escapeSvg(options.valueLabel ? options.valueLabel(min) : min)}</text><polyline points="${polyline}" fill="none" stroke="${LIGHT_BLUE}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${circles}${labels}</svg>`;
}

/** Multiple result-provided series, used for Social Security age-62/FRA/70 cumulative curves. */
export function renderMultiLineChartSvg(series: Array<{ label: string; points: ChartPoint[]; color?: string }>, options: { title: string; width?: number; height?: number } ): string {
  const width = options.width ?? 640;
  const height = options.height ?? 240;
  const active = series.map((item) => ({ ...item, values: item.points.map((point) => numberValue(point.value)) }))
    .filter((item) => item.values.some((value) => value !== null));
  if (!active.length) return emptyChart('No analysis data was supplied for this chart.', width, height, options.title);
  const allValues = active.flatMap((item) => item.values).filter((value): value is number => value !== null);
  const min = Math.min(0, ...allValues);
  const max = Math.max(...allValues, min + 1);
  const longest = Math.max(...active.map((item) => item.points.length));
  const x = (index: number) => 44 + (longest <= 1 ? 0 : index / (longest - 1) * (width - 64));
  const y = (value: number) => 22 + (1 - (value - min) / (max - min)) * (height - 62);
  const colors = [BLUE, LIGHT_BLUE, '#8A78FF', '#2E7D32'];
  const lines = active.map((item, seriesIndex) => {
    const points = item.points.map((point, index) => {
      const value = numberValue(point.value);
      return value === null ? null : `${x(index).toFixed(2)},${y(value).toFixed(2)}`;
    }).filter((point): point is string => point !== null).join(' ');
    return `<polyline points="${points}" fill="none" stroke="${item.color ?? colors[seriesIndex % colors.length]}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join('');
  const labels = active[0].points.filter((_, index) => longest <= 6 || index === 0 || index === longest - 1 || index % Math.ceil(longest / 5) === 0)
    .map((point, index) => `<text x="${x(active[0].points.indexOf(point)).toFixed(2)}" y="${height - 14}" text-anchor="middle" fill="${MUTED}" font-size="10">${escapeSvg(point.label)}</text>`).join('');
  const legend = active.map((item, index) => `<text x="${52 + index * 150}" y="17" fill="${item.color ?? colors[index % colors.length]}" font-size="10">● ${escapeSvg(item.label)}</text>`).join('');
  return `<svg class="report-chart" role="img" aria-label="${escapeSvg(options.title)}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" rx="10" fill="${SURFACE}"/><path d="M44 22V${height - 42}H${width - 20}" stroke="#3A4352" fill="none"/>${legend}${lines}${labels}</svg>`;
}

/** Percentile fan chart using p10/p50/p90 values supplied by the Monte Carlo engine. */
export function renderFanChartSvg(points: ChartPoint[], options: { title: string; width?: number; height?: number } ): string {
  const width = options.width ?? 640;
  const height = options.height ?? 240;
  const valid = points.map((point, index) => ({ index, label: point.label, lower: numberValue(point.lower), median: numberValue(point.value), upper: numberValue(point.upper) }))
    .filter((point): point is { index: number; label: string; lower: number; median: number; upper: number } => point.lower !== null && point.median !== null && point.upper !== null);
  if (!valid.length) return emptyChart('No percentile results were supplied for this chart.', width, height, options.title);
  const domain = valid.flatMap((point) => [point.lower, point.median, point.upper]);
  const min = Math.min(0, ...domain);
  const max = Math.max(...domain, min + 1);
  const x = (index: number) => 44 + (points.length <= 1 ? 0 : (index / (points.length - 1)) * (width - 64));
  const y = (value: number) => 22 + (1 - (value - min) / (max - min)) * (height - 62);
  const upper = valid.map((point) => `${x(point.index)},${y(point.upper)}`).join(' ');
  const lower = [...valid].reverse().map((point) => `${x(point.index)},${y(point.lower)}`).join(' ');
  const median = valid.map((point) => `${x(point.index)},${y(point.median)}`).join(' ');
  const labels = valid.filter((_, index) => valid.length <= 6 || index === 0 || index === valid.length - 1 || index % Math.ceil(valid.length / 5) === 0)
    .map((point) => `<text x="${x(point.index)}" y="${height - 14}" text-anchor="middle" fill="${MUTED}" font-size="10">${escapeSvg(point.label)}</text>`).join('');
  return `<svg class="report-chart" role="img" aria-label="${escapeSvg(options.title)}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" rx="10" fill="${SURFACE}"/><path d="M44 22V${height - 42}H${width - 20}" stroke="#3A4352" fill="none"/><polygon points="${upper} ${lower}" fill="#168CFF" fill-opacity=".23"/><polyline points="${median}" fill="none" stroke="${LIGHT_BLUE}" stroke-width="3"/><text x="8" y="28" fill="${MUTED}" font-size="10">P90</text><text x="8" y="${height - 45}" fill="${MUTED}" font-size="10">P10</text>${labels}</svg>`;
}

/** Donut chart for supplied tax-bucket balances. */
export function renderDonutChartSvg(slices: ChartSlice[], options: { title: string; width?: number; height?: number } ): string {
  const width = options.width ?? 350;
  const height = options.height ?? 220;
  const valid = slices.map((slice) => ({ ...slice, value: numberValue(slice.value) })).filter((slice): slice is ChartSlice & { value: number } => slice.value !== null && slice.value >= 0);
  const total = valid.reduce((sum, slice) => sum + slice.value, 0);
  if (!valid.length || total <= 0) return emptyChart('No tax-bucket result was supplied for this chart.', width, height, options.title);
  const colors = [BLUE, LIGHT_BLUE, '#8A78FF', '#2E7D32'];
  const radius = 62;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const arcs = valid.map((slice, index) => {
    const amount = (slice.value / total) * circumference;
    const arc = `<circle cx="105" cy="108" r="${radius}" fill="none" stroke="${slice.color ?? colors[index % colors.length]}" stroke-width="27" stroke-dasharray="${amount} ${circumference - amount}" stroke-dashoffset="${-offset}" transform="rotate(-90 105 108)"><title>${escapeSvg(`${slice.label}: ${slice.value}`)}</title></circle>`;
    offset += amount;
    return arc;
  }).join('');
  const legend = valid.map((slice, index) => `<text x="195" y="${65 + index * 28}" fill="#F6F7FB" font-size="12"><tspan fill="${slice.color ?? colors[index % colors.length]}">●</tspan> ${escapeSvg(slice.label)}</text>`).join('');
  return `<svg class="report-chart" role="img" aria-label="${escapeSvg(options.title)}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" rx="10" fill="${SURFACE}"/>${arcs}<text x="105" y="104" text-anchor="middle" fill="${MUTED}" font-size="11">Total</text><text x="105" y="121" text-anchor="middle" fill="#F6F7FB" font-size="12">${escapeSvg(Math.round(total).toLocaleString('en-US'))}</text>${legend}</svg>`;
}

/** Gauge used only when a numeric calculated score or probability is supplied. */
export function renderGaugeSvg(value: number | null | undefined, options: { title: string; suffix?: string; max?: number; width?: number; height?: number } ): string {
  const width = options.width ?? 240;
  const height = options.height ?? 150;
  const numeric = numberValue(value);
  const max = options.max ?? 100;
  if (numeric === null) return emptyChart('Not available from the supplied analysis.', width, height, options.title);
  const bounded = Math.max(0, Math.min(max, numeric));
  const pct = bounded / max;
  const color = pct >= .85 ? '#2E7D32' : pct >= .7 ? '#C77700' : '#B3261E';
  const radius = 58;
  const length = Math.PI * radius;
  return `<svg class="report-chart" role="img" aria-label="${escapeSvg(options.title)}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" rx="10" fill="${SURFACE}"/><path d="M${width / 2 - radius} 105 A${radius} ${radius} 0 0 1 ${width / 2 + radius} 105" fill="none" stroke="#2B3441" stroke-width="16"/><path d="M${width / 2 - radius} 105 A${radius} ${radius} 0 0 1 ${width / 2 + radius} 105" fill="none" stroke="${color}" stroke-width="16" stroke-linecap="round" stroke-dasharray="${length * pct} ${length}"/><text x="${width / 2}" y="89" text-anchor="middle" fill="#F6F7FB" font-size="29" font-weight="700">${escapeSvg(`${numeric.toFixed(1)}${options.suffix ?? ''}`)}</text><text x="${width / 2}" y="122" text-anchor="middle" fill="${MUTED}" font-size="11">${escapeSvg(options.title)}</text></svg>`;
}

/** Horizontal allocation bars for current and target data already computed by the allocation engine. */
export function renderAllocationBarsSvg(rows: Array<{ label: string; current?: number | null; target?: number | null }>, options: { title: string; width?: number; height?: number } ): string {
  const width = options.width ?? 640;
  const height = options.height ?? Math.max(150, 55 + rows.length * 46);
  if (!rows.length) return emptyChart('No allocation result was supplied for this chart.', width, height, options.title);
  const bar = (value: number | null | undefined, y: number, color: string) => {
    const n = numberValue(value);
    return n === null ? '' : `<rect x="150" y="${y}" width="${Math.max(0, Math.min(100, n)) * 4.3}" height="10" rx="5" fill="${color}"/><text x="590" y="${y + 9}" text-anchor="end" fill="#F6F7FB" font-size="11">${escapeSvg(`${n.toFixed(1)}%`)}</text>`;
  };
  const content = rows.map((row, index) => {
    const y = 32 + index * 46;
    return `<text x="16" y="${y + 10}" fill="#F6F7FB" font-size="12">${escapeSvg(row.label)}</text><text x="150" y="${y - 4}" fill="${MUTED}" font-size="9">Current</text>${bar(row.current, y, BLUE)}<text x="150" y="${y + 22}" fill="${MUTED}" font-size="9">Target</text>${bar(row.target, y + 26, LIGHT_BLUE)}`;
  }).join('');
  return `<svg class="report-chart" role="img" aria-label="${escapeSvg(options.title)}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" rx="10" fill="${SURFACE}"/>${content}</svg>`;
}

/** Stacked supplied-income bars with a supplied spending-need line for the cash-flow report page. */
export function renderIncomePlanSvg(points: Array<{ label: string; incomeSources: Array<number | null | undefined>; spending?: number | null }>, options: { title: string; width?: number; height?: number } ): string {
  const width = options.width ?? 640;
  const height = options.height ?? 240;
  const normalized = points.map((point) => ({
    label: point.label,
    sources: point.incomeSources.map(numberValue).map((value) => value === null ? 0 : Math.max(0, value)),
    spending: numberValue(point.spending),
  }));
  const hasData = normalized.some((point) => point.sources.some((value) => value > 0) || point.spending !== null);
  if (!hasData) return emptyChart('No cash-flow rows were supplied for this chart.', width, height, options.title);
  const totals = normalized.map((point) => point.sources.reduce((sum, value) => sum + value, 0));
  const max = Math.max(1, ...totals, ...normalized.map((point) => point.spending ?? 0));
  const plotHeight = height - 62;
  const xStep = (width - 68) / Math.max(1, normalized.length);
  const barWidth = Math.max(4, Math.min(24, xStep * .65));
  const colors = [BLUE, LIGHT_BLUE, '#8A78FF', '#2E7D32', '#C77700'];
  const bars = normalized.map((point, index) => {
    let cumulative = 0;
    const x = 46 + index * xStep + (xStep - barWidth) / 2;
    return point.sources.map((source, sourceIndex) => {
      const barHeight = source / max * plotHeight;
      const y = height - 42 - cumulative - barHeight;
      cumulative += barHeight;
      return barHeight > 0 ? `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${barHeight.toFixed(2)}" fill="${colors[sourceIndex % colors.length]}"/>` : '';
    }).join('');
  }).join('');
  const spendingLine = normalized.map((point, index) => {
    if (point.spending === null) return null;
    const x = 46 + index * xStep + xStep / 2;
    const y = height - 42 - point.spending / max * plotHeight;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).filter((point): point is string => point !== null).join(' ');
  const labels = normalized.filter((_, index) => normalized.length <= 6 || index === 0 || index === normalized.length - 1 || index % Math.ceil(normalized.length / 5) === 0)
    .map((point) => `<text x="${(46 + normalized.indexOf(point) * xStep + xStep / 2).toFixed(2)}" y="${height - 14}" text-anchor="middle" fill="${MUTED}" font-size="10">${escapeSvg(point.label)}</text>`).join('');
  return `<svg class="report-chart" role="img" aria-label="${escapeSvg(options.title)}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" rx="10" fill="${SURFACE}"/><path d="M44 22V${height - 42}H${width - 20}" stroke="#3A4352" fill="none"/>${bars}${spendingLine ? `<polyline points="${spendingLine}" fill="none" stroke="#F6F7FB" stroke-width="2.5" stroke-linejoin="round"/>` : ''}<text x="9" y="29" fill="${MUTED}" font-size="10">Income / spending</text>${labels}</svg>`;
}
