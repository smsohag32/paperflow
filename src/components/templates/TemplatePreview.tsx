import {
  computeInvoiceTotals,
  formatMoney,
  type CertificateData,
  type InvoiceData,
  type LetterheadData,
  type ResumeData,
  type TemplateKind,
  type TemplateTheme,
} from '@/lib/pdf/templates'

interface TemplatePreviewProps {
  kind: TemplateKind
  theme: TemplateTheme
  invoice: InvoiceData
  resume: ResumeData
  certificate: CertificateData
  letterhead: LetterheadData
  zoom: number // percentage e.g. 55 .. 120
}

function fontClass(font: TemplateTheme['font']) {
  if (font === 'serif') return 'font-serif'
  if (font === 'mono') return 'font-mono'
  return 'font-sans'
}

function hexAlpha(hex: string, alpha: number) {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  if (full.length !== 6) return `rgba(79, 70, 229, ${alpha})`
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function TemplatePreview({
  kind,
  theme,
  invoice,
  resume,
  certificate,
  letterhead,
  zoom,
}: TemplatePreviewProps) {
  const isLandscape = kind === 'certificate'
  const baseW = isLandscape ? 842 : 595
  const baseH = isLandscape ? 595 : 842
  const scale = zoom / 100

  return (
    <div
      className="mx-auto transition-[width,height] duration-150 ease-out"
      style={{
        width: `${Math.round(baseW * scale)}px`,
        height: `${Math.round(baseH * scale)}px`,
      }}
    >
      <div
        className={`relative origin-top-left overflow-hidden rounded-[3px] bg-white text-slate-800 page-shadow ${fontClass(
          kind === 'certificate' && theme.font === 'sans' && certificate.style === 'classic-gold'
            ? 'serif'
            : theme.font,
        )}`}
        style={{
          width: `${baseW}px`,
          height: `${baseH}px`,
          transform: `scale(${scale})`,
          fontSize: `${12 * theme.fontScale}px`,
        }}
      >
        {kind === 'invoice' && <InvoicePaper data={invoice} theme={theme} />}
        {kind === 'resume' && <ResumePaper data={resume} theme={theme} />}
        {kind === 'certificate' && <CertificatePaper data={certificate} theme={theme} />}
        {kind === 'letterhead' && <LetterheadPaper data={letterhead} theme={theme} />}
      </div>
    </div>
  )
}

/* ───────────────────────── INVOICE PAPER ───────────────────────── */

function InvoicePaper({ data, theme }: { data: InvoiceData; theme: TemplateTheme }) {
  const totals = computeInvoiceTotals(data)
  const accent = theme.accentColor
  const softBg = hexAlpha(accent, 0.08)

  const statusColor =
    data.status === 'PAID'
      ? '#059669'
      : data.status === 'OVERDUE'
        ? '#dc2626'
        : data.status === 'DRAFT'
          ? '#64748b'
          : accent

  return (
    <div className="flex h-full flex-col justify-between">
      <div>
        {/* Header */}
        {data.style === 'modern' ? (
          <div
            className="flex items-center justify-between px-11 py-7 text-white"
            style={{ backgroundColor: accent }}
          >
            <div className="flex items-center gap-3.5">
              {theme.logoDataUrl && (
                <img
                  src={theme.logoDataUrl}
                  alt="Logo"
                  className="h-12 w-12 rounded-md bg-white/95 object-contain p-1"
                />
              )}
              <div>
                <h2 className="text-[1.45em] leading-tight font-bold tracking-tight">
                  {data.fromName || 'Your Business'}
                </h2>
                <p className="mt-1 text-[0.76em] opacity-90">
                  {[data.fromEmail, data.fromPhone].filter(Boolean).join('  |  ')}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[1.9em] leading-none font-extrabold tracking-wider">INVOICE</div>
              <div className="mt-1.5 text-[0.88em] opacity-90">#{data.invoiceNumber}</div>
              <span className="mt-1.5 inline-block rounded-full bg-white/20 px-2.5 py-0.5 text-[0.7em] font-bold tracking-wider">
                {data.status}
              </span>
            </div>
          </div>
        ) : (
          <div className="px-11 pt-9">
            {data.style === 'classic' && (
              <div className="absolute inset-x-0 top-0 h-2" style={{ backgroundColor: accent }} />
            )}
            <div className="flex items-start justify-between border-b border-slate-200 pb-5">
              <div className="flex items-center gap-3">
                {theme.logoDataUrl && (
                  <img src={theme.logoDataUrl} alt="Logo" className="h-11 w-11 object-contain" />
                )}
                <div>
                  <h2 className="text-[1.4em] font-bold text-slate-900">
                    {data.fromName || 'Your Business'}
                  </h2>
                  <p className="text-[0.76em] text-slate-500">
                    {[data.fromEmail, data.fromPhone].filter(Boolean).join('  |  ')}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[1.8em] leading-none font-bold" style={{ color: accent }}>
                  INVOICE
                </div>
                <div className="mt-1 flex items-center justify-end gap-2 text-[0.78em] text-slate-500">
                  <span>#{data.invoiceNumber}</span>
                  <span
                    className="rounded px-1.5 py-0.5 text-[0.85em] font-bold text-white"
                    style={{ backgroundColor: statusColor }}
                  >
                    {data.status}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Addresses & Dates */}
        <div className="grid grid-cols-3 gap-4 px-11 pt-6 text-[0.78em]">
          <div>
            <div className="text-[0.85em] font-bold tracking-wider uppercase" style={{ color: accent }}>
              Bill To
            </div>
            <div className="mt-1 font-semibold text-slate-900">{data.toName}</div>
            {data.toCompany && <div className="text-slate-700">{data.toCompany}</div>}
            {data.toEmail && <div className="text-slate-500">{data.toEmail}</div>}
            <div className="mt-0.5 whitespace-pre-line text-slate-500">{data.toAddress}</div>
          </div>
          <div>
            <div className="text-[0.85em] font-bold tracking-wider uppercase" style={{ color: accent }}>
              From
            </div>
            <div className="mt-1 whitespace-pre-line text-slate-600">{data.fromAddress}</div>
          </div>
          <div className="space-y-2 text-right">
            <div>
              <div className="text-[0.85em] font-bold tracking-wider uppercase" style={{ color: accent }}>
                Issue Date
              </div>
              <div className="font-medium text-slate-800">{data.issueDate || '-'}</div>
            </div>
            <div>
              <div className="text-[0.85em] font-bold tracking-wider uppercase" style={{ color: accent }}>
                Due Date
              </div>
              <div className="font-bold text-slate-900">{data.dueDate || '-'}</div>
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="px-11 pt-6">
          <table className="w-full border-collapse text-[0.8em]">
            <thead>
              <tr style={{ backgroundColor: data.style === 'minimal' ? '#f1f5f9' : softBg, color: accent }}>
                <th className="rounded-l px-2.5 py-2 text-left text-[0.88em] font-bold tracking-wider uppercase">
                  Description
                </th>
                <th className="w-14 px-2 py-2 text-right text-[0.88em] font-bold tracking-wider uppercase">
                  Qty
                </th>
                <th className="w-24 px-2 py-2 text-right text-[0.88em] font-bold tracking-wider uppercase">
                  Rate
                </th>
                <th className="w-24 rounded-r px-2.5 py-2 text-right text-[0.88em] font-bold tracking-wider uppercase">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((it, idx) => (
                <tr
                  key={it.id}
                  className="border-b border-slate-100"
                  style={{
                    backgroundColor: idx % 2 === 1 && data.style !== 'minimal' ? '#f8fafc' : undefined,
                  }}
                >
                  <td className="px-2.5 py-2.5 text-slate-800">{it.description || 'Item'}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-slate-700">{it.quantity}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-slate-500">
                    {formatMoney(it.rate, data.currency)}
                  </td>
                  <td className="px-2.5 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                    {formatMoney(Math.max(0, it.quantity) * Math.max(0, it.rate), data.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary & Notes */}
        <div className="grid grid-cols-12 gap-5 px-11 pt-6 text-[0.78em]">
          <div className="col-span-7 space-y-3">
            {data.paymentTerms && (
              <div>
                <div className="text-[0.85em] font-bold tracking-wider uppercase" style={{ color: accent }}>
                  Payment Terms
                </div>
                <p className="mt-0.5 text-slate-700">{data.paymentTerms}</p>
              </div>
            )}
            {data.notes && (
              <div>
                <div className="text-[0.85em] font-bold tracking-wider uppercase" style={{ color: accent }}>
                  Notes
                </div>
                <p className="mt-0.5 whitespace-pre-line text-slate-500">{data.notes}</p>
              </div>
            )}
          </div>
          <div className="col-span-5 space-y-1.5">
            <div className="flex justify-between px-2 text-slate-600">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatMoney(totals.subtotal, data.currency)}</span>
            </div>
            {totals.discountAmount > 0 && (
              <div className="flex justify-between px-2 text-slate-600">
                <span>
                  Discount {data.discountType === 'percent' ? `(${data.discountValue}%)` : ''}
                </span>
                <span className="tabular-nums text-emerald-600">
                  -{formatMoney(totals.discountAmount, data.currency)}
                </span>
              </div>
            )}
            {totals.taxAmount > 0 && (
              <div className="flex justify-between px-2 text-slate-600">
                <span>Tax ({data.taxRate}%)</span>
                <span className="tabular-nums">{formatMoney(totals.taxAmount, data.currency)}</span>
              </div>
            )}
            {totals.shipping > 0 && (
              <div className="flex justify-between px-2 text-slate-600">
                <span>Shipping</span>
                <span className="tabular-nums">{formatMoney(totals.shipping, data.currency)}</span>
              </div>
            )}
            <div
              className="mt-2 flex items-center justify-between rounded-md px-3 py-2 text-white"
              style={{ backgroundColor: accent }}
            >
              <span className="text-[0.95em] font-bold tracking-wide">TOTAL DUE</span>
              <span className="text-[1.2em] font-extrabold tabular-nums">
                {formatMoney(totals.grandTotal, data.currency)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer & Signature */}
      <div className="flex items-end justify-between px-11 pb-7 text-[0.72em] text-slate-400">
        <span>
          {data.fromName} · Invoice #{data.invoiceNumber}
        </span>
        {(theme.signatureDataUrl || data.signerName) && (
          <div className="w-36 text-right">
            {theme.signatureDataUrl && (
              <img src={theme.signatureDataUrl} alt="Signature" className="ml-auto mb-1 h-9 object-contain" />
            )}
            <div className="border-t border-slate-300 pt-1 text-slate-600">
              {data.signerName || 'Authorized Signature'}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ───────────────────────── RESUME / CV PAPER ───────────────────────── */

function ResumePaper({ data, theme }: { data: ResumeData; theme: TemplateTheme }) {
  const accent = theme.accentColor
  const softBg = hexAlpha(accent, 0.07)
  const skills = data.skills
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  if (data.style === 'modern') {
    return (
      <div className="relative grid h-full grid-cols-12">
        <div className="absolute inset-x-0 top-0 h-2" style={{ backgroundColor: accent }} />
        {/* Left Sidebar */}
        <div className="col-span-4 space-y-5 px-5 pt-10 pb-6" style={{ backgroundColor: softBg }}>
          <div>
            <h1 className="text-[1.45em] leading-tight font-bold text-slate-900">
              {data.fullName || 'Your Name'}
            </h1>
            <p className="mt-1 text-[0.82em] font-semibold" style={{ color: accent }}>
              {data.headline}
            </p>
          </div>

          <div className="space-y-1 text-[0.72em]">
            <h3 className="border-b border-slate-200 pb-1 font-bold tracking-wider uppercase" style={{ color: accent }}>
              Contact
            </h3>
            {data.email && <p className="break-all text-slate-700">{data.email}</p>}
            {data.phone && <p className="text-slate-700">{data.phone}</p>}
            {data.location && <p className="text-slate-700">{data.location}</p>}
            {data.website && <p className="break-all text-slate-600">{data.website}</p>}
          </div>

          {skills.length > 0 && (
            <div className="space-y-1.5 text-[0.72em]">
              <h3 className="border-b border-slate-200 pb-1 font-bold tracking-wider uppercase" style={{ color: accent }}>
                Skills
              </h3>
              <div className="flex flex-wrap gap-1">
                {skills.map((sk) => (
                  <span key={sk} className="rounded bg-white/90 px-1.5 py-0.5 text-[0.92em] text-slate-700 shadow-xs">
                    {sk}
                  </span>
                ))}
              </div>
            </div>
          )}

          {data.languages && (
            <div className="space-y-1 text-[0.72em]">
              <h3 className="border-b border-slate-200 pb-1 font-bold tracking-wider uppercase" style={{ color: accent }}>
                Languages
              </h3>
              <p className="text-slate-700">{data.languages}</p>
            </div>
          )}
        </div>

        {/* Main Column */}
        <div className="col-span-8 space-y-4 px-7 pt-10 pb-6">
          {data.summary && (
            <section>
              <h3 className="border-b border-slate-200 pb-1 text-[0.82em] font-bold tracking-wider uppercase" style={{ color: accent }}>
                Profile Summary
              </h3>
              <p className="mt-1.5 text-[0.76em] leading-relaxed text-slate-700">{data.summary}</p>
            </section>
          )}

          {data.experience.length > 0 && (
            <section className="space-y-2.5">
              <h3 className="border-b border-slate-200 pb-1 text-[0.82em] font-bold tracking-wider uppercase" style={{ color: accent }}>
                Experience
              </h3>
              {data.experience.map((exp) => (
                <div key={exp.id} className="space-y-0.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[0.88em] font-bold text-slate-900">{exp.role}</span>
                    <span className="text-[0.72em] text-slate-500">{exp.period}</span>
                  </div>
                  <div className="text-[0.76em] font-medium italic" style={{ color: accent }}>
                    {[exp.company, exp.location].filter(Boolean).join(' · ')}
                  </div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[0.74em] leading-snug text-slate-700">
                    {exp.bullets
                      .split(/\r?\n/)
                      .map((b) => b.trim())
                      .filter(Boolean)
                      .map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                  </ul>
                </div>
              ))}
            </section>
          )}

          {data.education.length > 0 && (
            <section className="space-y-1.5">
              <h3 className="border-b border-slate-200 pb-1 text-[0.82em] font-bold tracking-wider uppercase" style={{ color: accent }}>
                Education
              </h3>
              {data.education.map((edu) => (
                <div key={edu.id}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[0.84em] font-bold text-slate-900">{edu.degree}</span>
                    <span className="text-[0.72em] text-slate-500">{edu.period}</span>
                  </div>
                  <div className="text-[0.75em] text-slate-600">{edu.school}</div>
                  {edu.details && <div className="text-[0.72em] italic text-slate-500">{edu.details}</div>}
                </div>
              ))}
            </section>
          )}

          {data.projects.length > 0 && (
            <section className="space-y-1.5">
              <h3 className="border-b border-slate-200 pb-1 text-[0.82em] font-bold tracking-wider uppercase" style={{ color: accent }}>
                Projects &amp; Certifications
              </h3>
              {data.projects.map((pr) => (
                <div key={pr.id}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[0.82em] font-bold text-slate-900">{pr.name}</span>
                    <span className="text-[0.7em]" style={{ color: accent }}>
                      {pr.link}
                    </span>
                  </div>
                  <p className="text-[0.73em] text-slate-600">{pr.description}</p>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
    )
  }

  // Executive / Classic Single-Column
  return (
    <div className="h-full">
      {data.style === 'executive' ? (
        <div className="px-10 py-6 text-white" style={{ backgroundColor: accent }}>
          <h1 className="text-[1.85em] leading-tight font-bold">{data.fullName || 'Your Name'}</h1>
          <p className="mt-0.5 text-[0.95em] opacity-95">{data.headline}</p>
          <p className="mt-2 text-[0.72em] opacity-85">
            {[data.email, data.phone, data.location, data.website].filter(Boolean).join('  |  ')}
          </p>
        </div>
      ) : (
        <div className="px-10 pt-8 pb-3 text-center">
          <h1 className="text-[1.8em] font-bold text-slate-900">{data.fullName || 'Your Name'}</h1>
          <p className="text-[0.9em] font-semibold" style={{ color: accent }}>
            {data.headline}
          </p>
          <p className="mt-1 text-[0.74em] text-slate-500">
            {[data.email, data.phone, data.location].filter(Boolean).join('  |  ')}
          </p>
          <div className="mt-3 h-0.5 w-full" style={{ backgroundColor: accent }} />
        </div>
      )}

      <div className="space-y-4 px-10 py-5">
        {data.summary && (
          <section>
            <h3 className="border-b border-slate-200 pb-0.5 text-[0.82em] font-bold tracking-wider uppercase" style={{ color: accent }}>
              Professional Summary
            </h3>
            <p className="mt-1.5 text-[0.78em] leading-relaxed text-slate-700">{data.summary}</p>
          </section>
        )}

        {data.experience.length > 0 && (
          <section className="space-y-2.5">
            <h3 className="border-b border-slate-200 pb-0.5 text-[0.82em] font-bold tracking-wider uppercase" style={{ color: accent }}>
              Experience
            </h3>
            {data.experience.map((exp) => (
              <div key={exp.id}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[0.86em] font-bold text-slate-900">
                    {exp.role} — {exp.company}
                  </span>
                  <span className="text-[0.74em] text-slate-500">
                    {exp.period}
                    {exp.location ? ` · ${exp.location}` : ''}
                  </span>
                </div>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[0.75em] text-slate-700">
                  {exp.bullets
                    .split(/\r?\n/)
                    .map((b) => b.trim())
                    .filter(Boolean)
                    .map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                </ul>
              </div>
            ))}
          </section>
        )}

        {data.education.length > 0 && (
          <section className="space-y-1.5">
            <h3 className="border-b border-slate-200 pb-0.5 text-[0.82em] font-bold tracking-wider uppercase" style={{ color: accent }}>
              Education
            </h3>
            {data.education.map((edu) => (
              <div key={edu.id}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[0.84em] font-bold text-slate-900">
                    {edu.degree} — {edu.school}
                  </span>
                  <span className="text-[0.74em] text-slate-500">{edu.period}</span>
                </div>
                {edu.details && <p className="text-[0.74em] italic text-slate-500">{edu.details}</p>}
              </div>
            ))}
          </section>
        )}

        {skills.length > 0 && (
          <section>
            <h3 className="border-b border-slate-200 pb-0.5 text-[0.82em] font-bold tracking-wider uppercase" style={{ color: accent }}>
              Skills &amp; Languages
            </h3>
            <p className="mt-1.5 text-[0.76em] text-slate-700">{skills.join('  ·  ')}</p>
            {data.languages && <p className="mt-1 text-[0.74em] italic text-slate-500">Languages: {data.languages}</p>}
          </section>
        )}
      </div>
    </div>
  )
}

/* ───────────────────────── CERTIFICATE PAPER ───────────────────────── */

function CertificatePaper({ data, theme }: { data: CertificateData; theme: TemplateTheme }) {
  const accent = theme.accentColor
  const softBg = hexAlpha(accent, 0.08)
  const gold = '#c29433'

  return (
    <div
      className="relative flex h-full flex-col items-center justify-between px-16 py-12 text-center"
      style={{
        backgroundColor:
          data.style === 'classic-gold' ? '#fefdf8' : data.style === 'royal-emerald' ? '#f8fcfb' : '#ffffff',
      }}
    >
      {/* Decorative borders */}
      {data.style === 'classic-gold' && (
        <>
          <div className="pointer-events-none absolute inset-6 border-[3.5px]" style={{ borderColor: gold }} />
          <div className="pointer-events-none absolute inset-8 border" style={{ borderColor: accent }} />
        </>
      )}
      {data.style === 'modern-indigo' && (
        <>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-6" style={{ backgroundColor: accent }} />
          <div className="pointer-events-none absolute inset-y-0 left-6 w-2" style={{ backgroundColor: softBg }} />
          <div className="pointer-events-none absolute top-7 right-7 bottom-7 left-11 border border-slate-200" />
        </>
      )}
      {data.style === 'royal-emerald' && (
        <>
          <div className="pointer-events-none absolute inset-5 border-4" style={{ borderColor: accent }} />
          <div className="pointer-events-none absolute inset-8 border" style={{ borderColor: gold }} />
        </>
      )}

      {/* Top */}
      <div className="relative z-10 flex flex-col items-center">
        {theme.logoDataUrl && <img src={theme.logoDataUrl} alt="Logo" className="mb-2 h-11 object-contain" />}
        <div className="text-[0.95em] font-bold tracking-[0.22em] uppercase" style={{ color: accent }}>
          {data.organization}
        </div>
        <h1 className="mt-3 text-[2.45em] leading-none font-extrabold tracking-wide text-slate-900">
          {data.title || 'CERTIFICATE OF ACHIEVEMENT'}
        </h1>
        <p className="mt-2.5 text-[0.82em] tracking-[0.18em] text-slate-500 uppercase">{data.subtitle}</p>
      </div>

      {/* Recipient & Citation */}
      <div className="relative z-10 max-w-xl">
        <div className="text-[2.8em] leading-tight font-bold italic" style={{ color: accent }}>
          {data.recipientName || 'Recipient Name'}
        </div>
        <div className="mx-auto my-2 h-0.5 w-80" style={{ backgroundColor: gold }} />
        <p className="mt-3 text-[0.94em] leading-relaxed text-slate-600">{data.description}</p>
        <p className="mt-2 text-[1.28em] font-bold text-slate-900">{data.courseOrEvent}</p>
      </div>

      {/* Signatories + Seal */}
      <div className="relative z-10 w-full space-y-4">
        <div className="grid grid-cols-3 items-end gap-6 px-6">
          <div className="text-center">
            {theme.signatureDataUrl && (
              <img src={theme.signatureDataUrl} alt="Signature" className="mx-auto mb-1 h-9 object-contain" />
            )}
            <div className="border-t border-slate-400 pt-1.5 text-[0.86em] font-bold text-slate-800">
              {data.signer1Name}
            </div>
            <div className="text-[0.72em] text-slate-500">{data.signer1Title}</div>
          </div>

          <div className="flex justify-center">
            <div
              className="flex size-16 items-center justify-center rounded-full border-2 text-[0.62em] font-extrabold tracking-widest"
              style={{ borderColor: gold, backgroundColor: softBg, color: accent }}
            >
              VERIFIED
            </div>
          </div>

          <div className="text-center">
            <div className="border-t border-slate-400 pt-1.5 text-[0.86em] font-bold text-slate-800">
              {data.signer2Name}
            </div>
            <div className="text-[0.72em] text-slate-500">{data.signer2Title}</div>
          </div>
        </div>

        <div className="flex items-center justify-between px-2 text-[0.72em] text-slate-500">
          <span>Date Issued: {data.issueDate}</span>
          <span>Certificate ID: {data.certificateId}</span>
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────── LETTERHEAD PAPER ───────────────────────── */

function LetterheadPaper({ data, theme }: { data: LetterheadData; theme: TemplateTheme }) {
  const accent = theme.accentColor

  return (
    <div className="relative flex h-full flex-col justify-between px-12 pt-11 pb-8">
      {data.style === 'corporate' && (
        <div className="absolute inset-x-0 top-0 h-2.5" style={{ backgroundColor: accent }} />
      )}

      <div>
        {/* Letterhead Header */}
        {data.style === 'editorial' ? (
          <div className="border-b border-slate-200 pb-4 text-center">
            {theme.logoDataUrl && <img src={theme.logoDataUrl} alt="Logo" className="mx-auto mb-2 h-10 object-contain" />}
            <h1 className="text-[1.4em] font-bold tracking-wider text-slate-900 uppercase">{data.companyName}</h1>
            {data.tagline && (
              <p className="text-[0.76em] italic" style={{ color: accent }}>
                {data.tagline}
              </p>
            )}
            <p className="mt-1 text-[0.7em] text-slate-500">{data.companyContact}</p>
          </div>
        ) : data.style === 'corporate' ? (
          <div className="flex items-center gap-3.5 border-b-2 pb-4" style={{ borderColor: accent }}>
            {theme.logoDataUrl && <img src={theme.logoDataUrl} alt="Logo" className="h-11 w-11 object-contain" />}
            <div>
              <h1 className="text-[1.4em] font-bold" style={{ color: accent }}>
                {data.companyName}
              </h1>
              {data.tagline && <p className="text-[0.76em] italic text-slate-500">{data.tagline}</p>}
            </div>
          </div>
        ) : (
          <div className="flex items-baseline justify-between border-b border-slate-200 pb-3">
            <div>
              <h1 className="text-[1.3em] font-bold text-slate-900">{data.companyName}</h1>
              <p className="text-[0.72em] text-slate-500">{data.companyAddress}</p>
            </div>
            <span className="text-[0.78em] text-slate-500">{data.date}</span>
          </div>
        )}

        {/* Ref & Date */}
        <div className="mt-5 flex items-center justify-between text-[0.78em]">
          <span className="font-semibold text-slate-500">{data.referenceNo ? `Ref: ${data.referenceNo}` : ''}</span>
          {data.style !== 'minimal' && <span className="text-slate-700">Date: {data.date}</span>}
        </div>

        {/* Recipient */}
        <div className="mt-5 text-[0.8em] leading-snug">
          <div className="font-bold text-slate-900">{data.recipientName}</div>
          {data.recipientTitle && <div className="text-slate-600">{data.recipientTitle}</div>}
          {data.recipientOrg && <div className="text-slate-600">{data.recipientOrg}</div>}
          {data.recipientAddress && (
            <div className="whitespace-pre-line text-slate-500">{data.recipientAddress}</div>
          )}
        </div>

        {/* Subject */}
        {data.subject && (
          <div className="mt-5 text-[0.88em] font-bold" style={{ color: accent }}>
            Subject: {data.subject}
          </div>
        )}

        {/* Body */}
        <div className="mt-4 space-y-3 text-[0.82em] leading-relaxed text-slate-800">
          {data.salutation && <p>{data.salutation}</p>}
          <div className="whitespace-pre-line">{data.body}</div>
        </div>

        {/* Closing & Signature */}
        <div className="mt-7 text-[0.82em]">
          <p className="text-slate-800">{data.closing}</p>
          {theme.signatureDataUrl ? (
            <img src={theme.signatureDataUrl} alt="Signature" className="my-2 h-11 object-contain" />
          ) : (
            <div className="h-8" />
          )}
          <div className="font-bold text-slate-900">{data.senderName}</div>
          <div className="text-[0.9em] text-slate-500">{data.senderTitle}</div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-slate-200 pt-2.5 text-center text-[0.68em] text-slate-400">
        {[data.companyAddress, data.companyContact].filter(Boolean).join('  |  ')}
      </div>
    </div>
  )
}
