import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChartSeriesDTO } from '@/api/types';
import { ChartContainer } from '@/components/common/ChartContainer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatOptionalNumber } from '@/lib/formatters';

interface ExperimentChartsTabsProps {
  charts: ChartSeriesDTO;
  keyPrefix: string;
}

export function ExperimentChartsTabs({
  charts,
  keyPrefix,
}: ExperimentChartsTabsProps) {
  const certData = useMemo(
    () =>
      charts.certification_rates.map((pt) => ({
        epsilonLabel: String(pt.epsilon),
        epsilon: pt.epsilon,
        baseline_percent: pt.baseline_percent,
        refined_percent: pt.refined_percent,
      })),
    [charts.certification_rates],
  );

  const widthData = useMemo(
    () =>
      charts.interval_widths.map((pt) => ({
        epsilonLabel: String(pt.epsilon),
        epsilon: pt.epsilon,
        baseline_width: pt.baseline_width,
        refined_width: pt.refined_width,
      })),
    [charts.interval_widths],
  );

  const runtimeData = useMemo(
    () =>
      charts.runtime.map((pt) => ({
        epsilonLabel: String(pt.epsilon),
        epsilon: pt.epsilon,
        baseline_time: pt.baseline_time,
        lp_refinement_time: pt.lp_refinement_time,
        refined_total_time: pt.refined_total_time,
      })),
    [charts.runtime],
  );

  const improvementData = useMemo(
    () =>
      charts.improvement.map((pt) => ({
        epsilonLabel: String(pt.epsilon),
        epsilon: pt.epsilon,
        improvement_pp: pt.improvement_pp,
      })),
    [charts.improvement],
  );

  // Mirror dashboard/visualizations.py:298-302 auto log-scale criterion
  const useLogRuntimeScale = useMemo(() => {
    const vals: number[] = [];
    for (const pt of runtimeData) {
      for (const v of [pt.baseline_time, pt.lp_refinement_time, pt.refined_total_time]) {
        if (typeof v === 'number' && Number.isFinite(v)) {
          vals.push(v);
        }
      }
    }
    const positive = vals.filter((v) => v > 0);
    if (positive.length !== vals.length || positive.length === 0) {
      return false;
    }
    const minVal = Math.min(...positive);
    const maxVal = Math.max(...positive);
    return maxVal / minVal >= 100;
  }, [runtimeData]);

  return (
    <Tabs defaultValue="certification" className="w-full">
      <TabsList aria-label="Analytical chart views">
        <TabsTrigger value="certification">Certification Rates</TabsTrigger>
        <TabsTrigger value="widths">Interval Widths</TabsTrigger>
        <TabsTrigger value="runtime">Runtime Comparison</TabsTrigger>
        <TabsTrigger value="improvement">Certification Improvement</TabsTrigger>
      </TabsList>

      <TabsContent value="certification">
        <ChartContainer
          id={`${keyPrefix}-certification`}
          title="Certification Rate Comparison"
          description="Percentage of evaluated samples certified robust at each perturbation radius. Missing measurements remain unavailable rather than zero."
          unit="%"
          data={certData}
          columns={[
            { key: 'epsilon', label: 'Epsilon (ε)' },
            {
              key: 'baseline_percent',
              label: 'Baseline IBP (%)',
              format: (v) => (typeof v === 'number' ? `${v.toFixed(2)}%` : '—'),
            },
            {
              key: 'refined_percent',
              label: 'Refined IBP + LP (%)',
              format: (v) => (typeof v === 'number' ? `${v.toFixed(2)}%` : '—'),
            },
          ]}
        >
          {({ showLegend, showGrid }) => (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={certData} margin={{ top: 12, right: 20, left: 4, bottom: 8 }}>
                {showGrid && <CartesianGrid stroke="#E5DCD3" strokeDasharray="3 3" />}
                <XAxis
                  dataKey="epsilonLabel"
                  tick={{ fill: '#30282A', fontSize: 12 }}
                  stroke="#C9BEB5"
                  label={{
                    value: 'Perturbation Radius (ε)',
                    position: 'insideBottom',
                    offset: -4,
                    fill: '#51494A',
                    fontSize: 12,
                  }}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 20, 40, 60, 80, 100]}
                  tick={{ fill: '#30282A', fontSize: 12 }}
                  stroke="#C9BEB5"
                  label={{
                    value: 'Certification rate (%)',
                    angle: -90,
                    position: 'insideLeft',
                    fill: '#51494A',
                    fontSize: 12,
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFCF8',
                    borderColor: '#E5DCD3',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  formatter={(val: unknown) =>
                    typeof val === 'number' ? `${val.toFixed(2)}%` : 'n/a'
                  }
                  labelFormatter={(label) => `ε = ${label}`}
                />
                {showLegend && <Legend wrapperStyle={{ fontSize: '12px' }} />}
                <Line
                  type="monotone"
                  dataKey="baseline_percent"
                  name="Baseline IBP"
                  stroke="#786B67"
                  strokeWidth={2.2}
                  dot={{ r: 4, fill: '#786B67' }}
                  connectNulls={false}
                />
                <Line
                  type="monotone"
                  dataKey="refined_percent"
                  name="Refined IBP + LP"
                  stroke="#702B3A"
                  strokeWidth={2.5}
                  dot={{ r: 4.5, fill: '#702B3A' }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartContainer>
      </TabsContent>

      <TabsContent value="widths">
        <ChartContainer
          id={`${keyPrefix}-widths`}
          title="Output Interval Width Comparison"
          description="Mean output logit interval width (upper − lower bound). Narrower widths reflect tighter output enclosures."
          unit="Logit units"
          data={widthData}
          columns={[
            { key: 'epsilon', label: 'Epsilon (ε)' },
            {
              key: 'baseline_width',
              label: 'Baseline IBP Width',
              format: (v) => formatOptionalNumber(v as number | null),
            },
            {
              key: 'refined_width',
              label: 'Refined IBP + LP Width',
              format: (v) => formatOptionalNumber(v as number | null),
            },
          ]}
        >
          {({ showLegend, showGrid }) => (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={widthData} margin={{ top: 12, right: 20, left: 4, bottom: 8 }}>
                {showGrid && <CartesianGrid stroke="#E5DCD3" strokeDasharray="3 3" />}
                <XAxis
                  dataKey="epsilonLabel"
                  tick={{ fill: '#30282A', fontSize: 12 }}
                  stroke="#C9BEB5"
                  label={{
                    value: 'Perturbation Radius (ε)',
                    position: 'insideBottom',
                    offset: -4,
                    fill: '#51494A',
                    fontSize: 12,
                  }}
                />
                <YAxis
                  tick={{ fill: '#30282A', fontSize: 12 }}
                  stroke="#C9BEB5"
                  label={{
                    value: 'Mean width (logit units)',
                    angle: -90,
                    position: 'insideLeft',
                    fill: '#51494A',
                    fontSize: 12,
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFCF8',
                    borderColor: '#E5DCD3',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  formatter={(val: unknown) =>
                    typeof val === 'number' ? formatOptionalNumber(val, 4) : 'n/a'
                  }
                  labelFormatter={(label) => `ε = ${label}`}
                />
                {showLegend && <Legend wrapperStyle={{ fontSize: '12px' }} />}
                <Bar
                  dataKey="baseline_width"
                  name="Baseline IBP"
                  fill="#786B67"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="refined_width"
                  name="Refined IBP + LP"
                  fill="#702B3A"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartContainer>
      </TabsContent>

      <TabsContent value="runtime">
        <ChartContainer
          id={`${keyPrefix}-runtime`}
          title="Mean Verification Runtime Comparison"
          description={
            useLogRuntimeScale
              ? 'Mean verification runtime per sample in seconds (logarithmic Y-axis enabled automatically because runtimes span ≥100×).'
              : 'Mean verification runtime per sample in seconds.'
          }
          unit={useLogRuntimeScale ? 's, log scale' : 'Seconds'}
          data={runtimeData}
          columns={[
            { key: 'epsilon', label: 'Epsilon (ε)' },
            {
              key: 'baseline_time',
              label: 'Baseline IBP (s)',
              format: (v) => formatOptionalNumber(v as number | null),
            },
            {
              key: 'lp_refinement_time',
              label: 'LP Refinement (s)',
              format: (v) => formatOptionalNumber(v as number | null),
            },
            {
              key: 'refined_total_time',
              label: 'Total Refined (s)',
              format: (v) => formatOptionalNumber(v as number | null),
            },
          ]}
        >
          {({ showLegend, showGrid }) => (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={runtimeData} margin={{ top: 12, right: 20, left: 4, bottom: 8 }}>
                {showGrid && <CartesianGrid stroke="#E5DCD3" strokeDasharray="3 3" />}
                <XAxis
                  dataKey="epsilonLabel"
                  tick={{ fill: '#30282A', fontSize: 12 }}
                  stroke="#C9BEB5"
                  label={{
                    value: 'Perturbation Radius (ε)',
                    position: 'insideBottom',
                    offset: -4,
                    fill: '#51494A',
                    fontSize: 12,
                  }}
                />
                <YAxis
                  scale={useLogRuntimeScale ? 'log' : 'auto'}
                  domain={useLogRuntimeScale ? ['auto', 'auto'] : [0, 'auto']}
                  allowDataOverflow={useLogRuntimeScale}
                  tick={{ fill: '#30282A', fontSize: 12 }}
                  stroke="#C9BEB5"
                  label={{
                    value: useLogRuntimeScale ? 'Mean runtime (s, log)' : 'Mean runtime (s)',
                    angle: -90,
                    position: 'insideLeft',
                    fill: '#51494A',
                    fontSize: 12,
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFCF8',
                    borderColor: '#E5DCD3',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  formatter={(val: unknown) =>
                    typeof val === 'number' ? `${formatOptionalNumber(val, 4)}s` : 'n/a'
                  }
                  labelFormatter={(label) => `ε = ${label}`}
                />
                {showLegend && <Legend wrapperStyle={{ fontSize: '12px' }} />}
                <Bar
                  dataKey="baseline_time"
                  name="Baseline IBP"
                  fill="#786B67"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="lp_refinement_time"
                  name="LP Refinement"
                  fill="#627D68"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="refined_total_time"
                  name="Total Refined"
                  fill="#702B3A"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartContainer>
      </TabsContent>

      <TabsContent value="improvement">
        <ChartContainer
          id={`${keyPrefix}-improvement`}
          title="Certification Rate Improvement (Refined − Baseline)"
          description="Absolute certification improvement in percentage points (pp). Positive values indicate cases newly certified by LP refinement."
          unit="pp"
          data={improvementData}
          columns={[
            { key: 'epsilon', label: 'Epsilon (ε)' },
            {
              key: 'improvement_pp',
              label: 'Improvement (pp)',
              format: (v) =>
                typeof v === 'number'
                  ? `${v > 0 ? '+' : ''}${v.toFixed(2)} pp`
                  : '—',
            },
          ]}
        >
          {({ showLegend, showGrid }) => (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={improvementData}
                margin={{ top: 12, right: 20, left: 4, bottom: 8 }}
              >
                {showGrid && <CartesianGrid stroke="#E5DCD3" strokeDasharray="3 3" />}
                <XAxis
                  dataKey="epsilonLabel"
                  tick={{ fill: '#30282A', fontSize: 12 }}
                  stroke="#C9BEB5"
                  label={{
                    value: 'Perturbation Radius (ε)',
                    position: 'insideBottom',
                    offset: -4,
                    fill: '#51494A',
                    fontSize: 12,
                  }}
                />
                <YAxis
                  tick={{ fill: '#30282A', fontSize: 12 }}
                  stroke="#C9BEB5"
                  label={{
                    value: 'Improvement (pp)',
                    angle: -90,
                    position: 'insideLeft',
                    fill: '#51494A',
                    fontSize: 12,
                  }}
                />
                <ReferenceLine y={0} stroke="#30282A" strokeWidth={1} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFCF8',
                    borderColor: '#E5DCD3',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  formatter={(val: unknown) =>
                    typeof val === 'number'
                      ? `${val > 0 ? '+' : ''}${val.toFixed(2)} pp`
                      : 'n/a'
                  }
                  labelFormatter={(label) => `ε = ${label}`}
                />
                {showLegend && <Legend wrapperStyle={{ fontSize: '12px' }} />}
                <Bar
                  dataKey="improvement_pp"
                  name="Certification Improvement (pp)"
                  radius={[4, 4, 0, 0]}
                >
                  {improvementData.map((entry, idx) => {
                    const val = entry.improvement_pp ?? 0;
                    const fill =
                      val > 0 ? '#627D68' : val < 0 ? '#963E50' : '#A7793D';
                    return <Cell key={`cell-${idx}`} fill={fill} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartContainer>
      </TabsContent>
    </Tabs>
  );
}
