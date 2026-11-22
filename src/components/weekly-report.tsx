import { NOT_LOGGED, REPORT_SECTIONS, type WeeklyReport, type WeeklyReportInput } from "@/lib/weekly-report";

export function WeeklyReportText({ report }: { report: WeeklyReport }) {
  return (
    <div className="grid gap-3 break-words">
      <p className="whitespace-pre-wrap">{report.summary}</p>
      <div>
        <h3 className="mb-1 font-medium">Focus for next week</h3>
        <ul className="list-disc space-y-1 pl-5">
          {report.focus.map((point, index) => <li key={index}>{point}</li>)}
        </ul>
      </div>
    </div>
  );
}

export function WeeklyReportFigures({ sections }: { sections: WeeklyReportInput["sections"] }) {
  return (
    <div className="grid gap-4 break-words">
      {Object.entries(REPORT_SECTIONS).map(([key, title]) => {
        const rows = sections[key as keyof typeof sections];
        return (
          <section key={key} className="border-t pt-3">
            <h3 className="mb-1 font-medium">{title}</h3>
            {rows.length ? (
              <dl className="space-y-1 text-sm">
                {rows.map(({ label, value }, index) => (
                  <div key={index} className="grid gap-x-3 sm:grid-cols-2">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            ) : <p className="text-sm text-muted-foreground">{NOT_LOGGED}</p>}
          </section>
        );
      })}
    </div>
  );
}
