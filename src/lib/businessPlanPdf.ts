/** A4 content width at 96dpi — stable layout for html2canvas. */
const PDF_WIDTH_PX = 794;

const PDF_EXPORT_CSS = `
.pdf-export-root {
  background: #ffffff !important;
  color: #0a0a0a !important;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
.pdf-export-root .text-ink-300 { color: #d6d6d6 !important; }
.pdf-export-root .text-ink-400 { color: #737373 !important; }
.pdf-export-root .text-ink-500 { color: #525252 !important; }
.pdf-export-root .text-ink-600,
.pdf-export-root .text-ink-700 { color: #262626 !important; }
.pdf-export-root .text-ink-950,
.pdf-export-root strong { color: #0a0a0a !important; }
.pdf-export-root .bg-ink-950 {
  background-color: #0a0a0a !important;
  color: #f5f5f5 !important;
}
.pdf-export-root .bg-ink-950 .text-white,
.pdf-export-root .bg-ink-950 strong.text-white { color: #ffffff !important; }
.pdf-export-root .bg-ink-50 { background-color: #f0f0f0 !important; }
.pdf-export-root .bg-teal\\/5 { background-color: #e6f7f5 !important; }
.pdf-export-root .border-ink-950,
.pdf-export-root .border-b-3,
.pdf-export-root .border-3 { border-color: #0a0a0a !important; }
.pdf-export-root .border-ink-200 { border-color: #d4d4d4 !important; }
.pdf-export-root .border-teal { border-color: #0d9488 !important; }
.pdf-export-root .text-teal { color: #0f766e !important; }
.pdf-export-root .bg-teal { background-color: #0d9488 !important; }
.pdf-export-root .card-brutal {
  box-shadow: none !important;
}
`;

function stripNonExportNodes(root: HTMLElement): void {
  root.querySelectorAll('.print\\:hidden, [data-pdf-exclude]').forEach((el) => el.remove());
  root.querySelectorAll('a').forEach((anchor) => {
    const text = anchor.textContent?.trim();
    if (!text) {
      anchor.remove();
      return;
    }
    const span = root.ownerDocument!.createElement('span');
    span.textContent = text;
    span.className = anchor.className.replace(/\bprint:hidden\b/g, '').trim();
    anchor.replaceWith(span);
  });
  root.querySelectorAll('button').forEach((el) => el.remove());
}

function relaxOverflowForCapture(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[class*="overflow-hidden"]').forEach((el) => {
    el.style.overflow = 'visible';
  });
}

function injectPdfStyles(root: HTMLElement): void {
  if (root.querySelector('style[data-pdf-export]')) return;
  const style = root.ownerDocument!.createElement('style');
  style.setAttribute('data-pdf-export', 'true');
  style.textContent = PDF_EXPORT_CSS;
  root.prepend(style);
}

function preparePdfClone(element: HTMLElement): { clone: HTMLElement; wrapper: HTMLDivElement } {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.id = 'business-plan-pdf-clone';
  clone.classList.add('pdf-export-root');
  clone.style.width = `${PDF_WIDTH_PX}px`;
  clone.style.maxWidth = `${PDF_WIDTH_PX}px`;
  clone.style.margin = '0';
  clone.style.padding = '0';
  clone.style.overflow = 'visible';

  stripNonExportNodes(clone);
  relaxOverflowForCapture(clone);
  injectPdfStyles(clone);

  const wrapper = document.createElement('div');
  wrapper.setAttribute('aria-hidden', 'true');
  wrapper.style.cssText = [
    'position:fixed',
    'left:-99999px',
    'top:0',
    `width:${PDF_WIDTH_PX}px`,
    'background:#ffffff',
    'z-index:-1',
    'pointer-events:none',
    'overflow:visible',
  ].join(';');
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  return { clone, wrapper };
}

/** Wait for async blocks (e.g. registry stats) before capture. */
async function waitForExportReady(root: HTMLElement, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const text = root.textContent ?? '';
    if (!text.includes('Loading registry insights')) return;
    await new Promise((r) => setTimeout(r, 150));
  }
}

function sectionTargets(root: HTMLElement): HTMLElement[] {
  const marked = Array.from(root.querySelectorAll<HTMLElement>('[data-pdf-section]'));
  if (marked.length > 0) return marked;
  return [root];
}

async function captureSection(
  html2canvas: typeof import('html2canvas')['default'],
  section: HTMLElement,
): Promise<HTMLCanvasElement> {
  const height = Math.max(section.scrollHeight, section.offsetHeight, 1);
  return html2canvas(section, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    width: PDF_WIDTH_PX,
    height,
    windowWidth: PDF_WIDTH_PX,
    windowHeight: height,
    scrollX: 0,
    scrollY: 0,
    onclone: (_doc, node) => {
      const el = node as HTMLElement;
      stripNonExportNodes(el);
      relaxOverflowForCapture(el);
      injectPdfStyles(el.closest('.pdf-export-root') ?? el);
    },
  });
}

function appendCanvasToPdf(
  pdf: InstanceType<typeof import('jspdf')['jsPDF']>,
  canvas: HTMLCanvasElement,
  startOnNewPage: boolean,
): void {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const imgData = canvas.toDataURL('image/png', 1);

  if (startOnNewPage) pdf.addPage();

  let heightLeft = imgHeight;
  let position = 0;
  pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    pdf.addPage();
    position = heightLeft - imgHeight;
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }
}

/** Export full business plan (all sections) to a multi-page A4 PDF. */
export async function downloadElementAsPdf(element: HTMLElement, filename: string): Promise<void> {
  let html2canvas: typeof import('html2canvas')['default'];
  let jsPDF: typeof import('jspdf')['jsPDF'];
  try {
    [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ]);
  } catch {
    window.print();
    return;
  }

  const { clone, wrapper } = preparePdfClone(element);

  try {
    await waitForExportReady(clone);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const sections = sectionTargets(clone);
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    for (let i = 0; i < sections.length; i++) {
      const canvas = await captureSection(html2canvas, sections[i]);
      appendCanvasToPdf(pdf, canvas, i > 0);
    }

    pdf.save(filename);
  } finally {
    wrapper.remove();
  }
}
