'use client';

import Link from 'next/link';
import { ArrowRight, BrainCircuit, DatabaseZap, Factory, FlaskConical, ShieldCheck } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, XAxis, YAxis } from 'recharts';

import benchmarkComparison from '@/data/secom-case-study/benchmark-comparison.json';
import dailyTrend from '@/data/secom-case-study/daily-trend.json';
import featureImportance from '@/data/secom-case-study/feature-importance.json';
import riskDeciles from '@/data/secom-case-study/risk-deciles.json';
import summary from '@/data/secom-case-study/summary.json';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';

const decileChartConfig = {
  fail_rate: {
    label: 'Failure Rate',
    color: '#dc2626',
  },
};

const trendChartConfig = {
  avg_score: {
    label: 'Average Risk Score',
    color: '#2563eb',
  },
  fail_rate: {
    label: 'Observed Fail Rate',
    color: '#dc2626',
  },
};

const featureChartConfig = {
  abs_coefficient: {
    label: 'Absolute Coefficient',
    color: '#0f766e',
  },
};

const highlightMetrics = [
  {
    label: 'ROC-AUC',
    value: summary.model.threshold_free_metrics.roc_auc.toFixed(3),
    note: 'Chronological holdout on the latest 20% of lots',
  },
  {
    label: 'PR-AUC',
    value: summary.model.threshold_free_metrics.pr_auc.toFixed(3),
    note: 'More informative than accuracy under 6.6% failure prevalence',
  },
  {
    label: 'Top 10% Precision',
    value: `${(summary.review_budgets[1].precision * 100).toFixed(1)}%`,
    note: `${summary.review_budgets[1].lift_vs_random.toFixed(2)}x higher failure yield than random review`,
  },
  {
    label: 'Top 20% Recall',
    value: `${(summary.review_budgets[2].recall * 100).toFixed(1)}%`,
    note: 'Share of failures captured when engineering reviews one-fifth of lots',
  },
];

const capabilityCards = [
  {
    title: 'Problem Framing',
    description: 'Translate an imbalanced manufacturing classification problem into a review-queue prioritization system.',
    icon: Factory,
  },
  {
    title: 'Data Science Workflow',
    description: 'Temporal holdout, missing-data treatment, class weighting, and interpretable model coefficients.',
    icon: FlaskConical,
  },
  {
    title: 'AI Product Layer',
    description: 'Ops-Copilot remains the operator-facing shell that explains context, source material, and checklist actions.',
    icon: BrainCircuit,
  },
  {
    title: 'Operationalization',
    description: 'SQL artifacts show how the model would feed review queues, drift monitoring, and business impact reporting.',
    icon: DatabaseZap,
  },
];

const publishedModel = benchmarkComparison.find((item) => item.model_key === 'logistic_regression');

export function CaseStudyOverview() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#eff6ff,_#f8fafc_48%,_#e2e8f0)] text-slate-950">
      <div className="mx-auto flex max-w-7xl flex-col gap-12 px-4 py-10 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white/90 shadow-xl shadow-slate-200/80 backdrop-blur">
          <div className="grid gap-8 px-6 py-8 md:grid-cols-[1.4fr_0.9fr] md:px-10 md:py-10">
            <div className="space-y-6">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="bg-sky-100 text-sky-800 hover:bg-sky-100">
                  Industrial Data Science Case Study
                </Badge>
                <Badge variant="outline">UCI SECOM</Badge>
                <Badge variant="outline">Chronological Holdout</Badge>
              </div>
              <div className="space-y-4">
                <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-slate-950 md:text-5xl">
                  Ops-Copilot now doubles as an industrial failure-risk prioritization project.
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-slate-600">
                  This public page documents the data science layer behind the product: a manufacturing case study that ranks
                  wafer lots for limited engineering review capacity using the UCI SECOM dataset.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild>
                  <Link href="/login">
                    Open Product Demo
                    <ArrowRight />
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="https://archive.ics.uci.edu/dataset/179/secom" target="_blank" rel="noreferrer">
                    View Dataset Source
                  </Link>
                </Button>
              </div>
            </div>
            <Card className="border-slate-200 bg-slate-950 text-white">
              <CardHeader>
                <CardTitle>Why this is portfolio-grade</CardTitle>
                <CardDescription className="text-slate-300">
                  The repo now demonstrates both AI product work and measurable industrial ML reasoning.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-slate-200">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-400" />
                  <p>Temporal holdout instead of a flattering random split.</p>
                </div>
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-400" />
                  <p>Review-budget metrics that match how engineering teams actually work.</p>
                </div>
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-400" />
                  <p>SQL monitoring artifacts and interpretable feature signals for stakeholder review.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {highlightMetrics.map((metric) => (
            <Card key={metric.label} className="border-slate-200 bg-white/90 shadow-md shadow-slate-200/60">
              <CardHeader className="pb-2">
                <CardDescription>{metric.label}</CardDescription>
                <CardTitle className="text-3xl">{metric.value}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-600">{metric.note}</CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {capabilityCards.map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.title} className="border-slate-200 bg-white/80 shadow-sm">
                <CardHeader className="space-y-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-xl">{item.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-6 text-slate-600">{item.description}</CardContent>
              </Card>
            );
          })}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <Card className="border-slate-200 bg-white/90 shadow-md shadow-slate-200/60">
            <CardHeader>
              <CardTitle>Risk deciles on the latest production slice</CardTitle>
              <CardDescription>
                Higher-ranked lots show materially higher failure yield than the baseline failure rate of{' '}
                {(summary.model.test_set.failure_rate * 100).toFixed(1)}%.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={decileChartConfig} className="h-[320px] w-full">
                <BarChart data={riskDeciles} margin={{ left: 12, right: 12, top: 12 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="bucket" tickLine={false} axisLine={false} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent formatter={(value) => `${(Number(value) * 100).toFixed(1)}%`} />}
                  />
                  <Bar dataKey="fail_rate" radius={[8, 8, 0, 0]}>
                    {riskDeciles.map((entry, index) => (
                      <Cell key={entry.bucket} fill={index === 0 ? '#dc2626' : '#f97316'} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white/90 shadow-md shadow-slate-200/60">
            <CardHeader>
              <CardTitle>Dataset summary</CardTitle>
              <CardDescription>Public industrial dataset used to build the offline modeling narrative.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-700">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-100 p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Lots</div>
                  <div className="mt-1 text-2xl font-semibold">{summary.dataset.total_rows}</div>
                </div>
                <div className="rounded-2xl bg-slate-100 p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Sensor Features</div>
                  <div className="mt-1 text-2xl font-semibold">{summary.dataset.total_sensor_features}</div>
                </div>
                <div className="rounded-2xl bg-slate-100 p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Failures</div>
                  <div className="mt-1 text-2xl font-semibold">{summary.dataset.failures}</div>
                </div>
                <div className="rounded-2xl bg-slate-100 p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Kept Features</div>
                  <div className="mt-1 text-2xl font-semibold">{summary.preprocessing.kept_features}</div>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 leading-6">
                <p className="font-medium text-slate-900">Modeling rule</p>
                <p>{summary.preprocessing.missingness_rule}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 leading-6">
                <p className="font-medium text-slate-900">Operational framing</p>
                <p>{summary.portfolio_summary.why_ranking_not_threshold}</p>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-slate-200 bg-white/90 shadow-md shadow-slate-200/60">
            <CardHeader>
              <CardTitle>Benchmark comparison</CardTitle>
              <CardDescription>
                The published result is compared against both a naive floor and a higher-capacity tree benchmark.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {benchmarkComparison.map((model) => (
                <div key={model.model_key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-slate-950">{model.short_name}</p>
                      <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{model.description}</p>
                    </div>
                    {model.model_key === 'logistic_regression' ? (
                      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Published model</Badge>
                    ) : (
                      <Badge variant="outline">Benchmark</Badge>
                    )}
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-4">
                    <div className="rounded-xl bg-white p-3 text-sm">
                      <div className="text-slate-500">ROC-AUC</div>
                      <div className="mt-1 text-xl font-semibold">{model.roc_auc.toFixed(3)}</div>
                    </div>
                    <div className="rounded-xl bg-white p-3 text-sm">
                      <div className="text-slate-500">PR-AUC</div>
                      <div className="mt-1 text-xl font-semibold">{model.pr_auc.toFixed(3)}</div>
                    </div>
                    <div className="rounded-xl bg-white p-3 text-sm">
                      <div className="text-slate-500">Top 10% Recall</div>
                      <div className="mt-1 text-xl font-semibold">{(model.top_review_recall * 100).toFixed(1)}%</div>
                    </div>
                    <div className="rounded-xl bg-white p-3 text-sm">
                      <div className="text-slate-500">Top 10% Lift</div>
                      <div className="mt-1 text-xl font-semibold">{model.top_review_lift.toFixed(2)}x</div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-slate-950 text-white shadow-md shadow-slate-300/40">
            <CardHeader>
              <CardTitle>Why logistic regression stays published</CardTitle>
              <CardDescription className="text-slate-300">
                The final portfolio model choice is deliberate, not accidental.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-6 text-slate-200">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <p>{summary.model.selection_reason}</p>
              </div>
              {publishedModel ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-400">Published PR-AUC</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{publishedModel.pr_auc.toFixed(3)}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-400">Published Top 10% Lift</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{publishedModel.top_review_lift.toFixed(2)}x</p>
                  </div>
                </div>
              ) : null}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <p className="font-medium text-white">Recruiter takeaway</p>
                <p className="mt-1">
                  The repo shows model comparison, metric tradeoffs, and an explainable final choice rather than presenting a
                  single flattering metric in isolation.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <Card className="border-slate-200 bg-white/90 shadow-md shadow-slate-200/60">
            <CardHeader>
              <CardTitle>Top coefficients in the baseline model</CardTitle>
              <CardDescription>
                Sensor names are anonymized in SECOM, but the ranking still shows interpretable signal concentration.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={featureChartConfig} className="h-[340px] w-full">
                <BarChart data={[...featureImportance].reverse()} layout="vertical" margin={{ left: 24, right: 16 }}>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} />
                  <YAxis
                    dataKey="feature"
                    type="category"
                    width={95}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent hideLabel formatter={(value) => Number(value).toFixed(3)} />}
                  />
                  <Bar dataKey="abs_coefficient" fill="#0f766e" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white/90 shadow-md shadow-slate-200/60">
            <CardHeader>
              <CardTitle>Daily risk trend on the evaluation window</CardTitle>
              <CardDescription>
                This is the kind of operational view used to decide when review load or process drift is rising.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={trendChartConfig} className="h-[340px] w-full">
                <LineChart data={dailyTrend} margin={{ left: 12, right: 12, top: 12 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        formatter={(value, name) =>
                          name === 'Observed Fail Rate'
                            ? `${(Number(value) * 100).toFixed(1)}%`
                            : Number(value).toFixed(3)
                        }
                      />
                    }
                  />
                  <Line type="monotone" dataKey="avg_score" stroke="#2563eb" strokeWidth={3} dot={false} />
                  <Line type="monotone" dataKey="fail_rate" stroke="#dc2626" strokeWidth={2} dot={false} />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <Card className="border-slate-200 bg-white/90 shadow-md shadow-slate-200/60">
            <CardHeader>
              <CardTitle>Review-budget operating points</CardTitle>
              <CardDescription>
                The model is evaluated as a queue-prioritization system, not only as a binary classifier.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {summary.review_budgets.map((budget) => (
                <div key={budget.review_budget_pct} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900">Top {budget.review_budget_pct.toFixed(0)}% review queue</p>
                      <p className="text-sm text-slate-500">{budget.lots_reviewed} lots inspected in the holdout slice</p>
                    </div>
                    <Badge variant="outline">{budget.lift_vs_random.toFixed(2)}x lift</Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                    <div className="rounded-xl bg-white p-3">
                      <div className="text-slate-500">Precision</div>
                      <div className="mt-1 text-xl font-semibold">{(budget.precision * 100).toFixed(1)}%</div>
                    </div>
                    <div className="rounded-xl bg-white p-3">
                      <div className="text-slate-500">Recall</div>
                      <div className="mt-1 text-xl font-semibold">{(budget.recall * 100).toFixed(1)}%</div>
                    </div>
                    <div className="rounded-xl bg-white p-3">
                      <div className="text-slate-500">Captured Fails</div>
                      <div className="mt-1 text-xl font-semibold">{budget.captured_failures}</div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-slate-950 text-white shadow-md shadow-slate-300/40">
            <CardHeader>
              <CardTitle>What a recruiter can verify in the repo</CardTitle>
              <CardDescription className="text-slate-300">
                The DS layer is not a slide deck; it is backed by runnable artifacts and product-facing outputs.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-200">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <p className="font-medium text-white">Python analysis</p>
                <p className="mt-1">`analysis/run_secom_case_study.py` generates the metrics and chart data that drive this page.</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <p className="font-medium text-white">SQL surfaces</p>
                <p className="mt-1">`sql/` contains review queue, model monitoring, and impact reporting queries for a warehouse setting.</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <p className="font-medium text-white">AI product integration</p>
                <p className="mt-1">The authenticated Ops-Copilot dashboard remains the operator-facing shell for explanations and checklist workflows.</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <p className="font-medium text-white">Result framing</p>
                <p className="mt-1">{summary.portfolio_summary.headline_result}</p>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <Card className="border-slate-200 bg-white/90 shadow-md shadow-slate-200/60">
            <CardHeader>
              <CardTitle>Experiment log</CardTitle>
              <CardDescription>
                Short version of the modeling path from naive floor to published portfolio model.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {summary.experiment_log.map((entry) => (
                <div key={entry.step} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-medium text-slate-950">{entry.step}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{entry.takeaway}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white/90 shadow-md shadow-slate-200/60">
            <CardHeader>
              <CardTitle>What this proves in interviews</CardTitle>
              <CardDescription>
                The project now carries evidence for both data science and production-oriented software discussions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-6 text-slate-700">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-medium text-slate-950">Industrial ML framing</p>
                <p className="mt-1">
                  You can turn a noisy manufacturing dataset into a review-queue decision problem with evaluation logic that
                  matches constrained engineering capacity.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-medium text-slate-950">Model governance</p>
                <p className="mt-1">
                  You can compare baselines, defend the final model choice, and keep the public claim conservative.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-medium text-slate-950">Product packaging</p>
                <p className="mt-1">
                  You can connect the modeling layer to an operator-facing application with auth, persistence, auditability,
                  and documented quality gates.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
