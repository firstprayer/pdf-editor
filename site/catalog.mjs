// One entry per page. scripts/build-pages.mjs turns this into the static HTML
// for every tool (metadata, structured data, the site bar and the crawlable
// guide under the app). Keep copy factual: no claims the tool cannot back up.

export const SITE = {
  origin: "https://firstprayer.github.io",
  base: "/pdf-editor/",
  name: "PDF Editor",
  repo: "https://github.com/firstprayer/pdf-editor",
};

const PRIVACY =
  "Your files are opened, changed and saved by this browser tab. Nothing is uploaded, and the original file on your device is never modified. Closing the tab discards everything, so download your result first.";

const FREE = {
  q: "Is it free?",
  a: "Yes. There is no account, no watermark, no daily limit and no paid tier.",
};

const UPLOAD = {
  q: "Are my files uploaded?",
  a: "No. Everything runs in your browser with PDF.js and pdf-lib. Your documents are never sent to a server.",
};

export const TOOLS = [
  {
    id: "edit",
    slug: "",
    nav: "Edit",
    name: "Edit PDF",
    entry: "/src/main.jsx",
    title: "Free PDF Editor Online: Edit, Sign and Redact PDFs in Your Browser",
    description:
      "Edit PDF text, add text boxes, sign, highlight, redact and reorder pages for free. Files are processed in your browser and never uploaded. No account.",
    h1: "Free PDF editor that works in your browser",
    lead: "Open a PDF, change it, and download the result. Editing happens on your device, so your documents are never uploaded. There is no account, no watermark and nothing to install.",
    features: [
      ["Edit text.", "Replace a line of existing text, or add new text boxes anywhere."],
      ["Sign.", "Draw or type a signature and place it on the page."],
      ["Mark up.", "Highlight passages and draw freehand."],
      ["Redact.", "Permanently remove sensitive areas from the downloaded file."],
      ["Add images.", "Place a PNG or JPEG, such as a logo or a stamp."],
      ["Organize pages.", "Add PDFs, blank pages, rotate, reorder, duplicate and delete."],
    ],
    featureList: [
      "Edit existing PDF text",
      "Add text boxes",
      "Draw or type a signature",
      "Highlight and freehand drawing",
      "Permanent redaction",
      "Insert PNG or JPEG images",
      "Rotate, reorder, duplicate and delete pages",
    ],
    privacy:
      "The page is rendered with PDF.js and the new file is written with pdf-lib, both running in this browser tab. Your PDF is read into memory, your edits are kept as a list, and a new PDF is built when you download. The original file is never modified. Closing or refreshing the tab discards everything, so download your work first.",
    faq: [
      UPLOAD,
      FREE,
      {
        q: "Can I edit the existing text in a PDF?",
        a: "Yes, for horizontal, selectable text. The replacement uses a standard PDF font on a white background, so it will not match the original font exactly, and the edited page is flattened to an image with searchable replacement text.",
      },
      {
        q: "Does redaction really remove the text?",
        a: "Yes. A redacted page is rebuilt from sanitized pixels, so the original text, images and hidden annotation text on that page are not copied into the downloaded file.",
      },
      {
        q: "What are the limits?",
        a: "Up to 50 MB per PDF, 100 MB in total and 200 pages. OCR, password-protected PDFs, form-field editing and certificate-based digital signatures are not supported.",
      },
    ],
  },
  {
    id: "merge",
    howTo: "How to merge PDF files",
    slug: "merge-pdf",
    nav: "Merge",
    name: "Merge PDF",
    entry: "/src/tools/merge.jsx",
    title: "Merge PDF Files Free: Combine PDFs in Your Browser",
    description:
      "Combine several PDF files into one, in the order you choose. Free, no sign-up, and your files never leave your device.",
    h1: "Merge PDF files into one document",
    lead: "Add two or more PDFs, put them in order and download a single file. Pages are copied as they are, so text stays selectable and quality does not change.",
    steps: [
      "Choose or drop the PDF files you want to combine.",
      "Drag the files, or use the arrows, to set their order.",
      "Select Merge and download.",
    ],
    featureList: ["Combine up to 20 PDFs", "Reorder files before merging", "Lossless page copy"],
    faq: [
      UPLOAD,
      {
        q: "Will merging reduce quality?",
        a: "No. Pages are copied into the new file without re-rendering, so text, images and links inside the pages are kept as they were.",
      },
      {
        q: "How many files can I merge?",
        a: "Up to 20 files, 100 MB combined and 200 pages in the merged document.",
      },
      {
        q: "Can I merge password-protected PDFs?",
        a: "Not yet. Remove the password in the app that created the file, then merge the unlocked copy.",
      },
      FREE,
    ],
  },
  {
    id: "split",
    howTo: "How to split a PDF",
    slug: "split-pdf",
    nav: "Split",
    name: "Split PDF",
    entry: "/src/tools/split.jsx",
    title: "Split PDF Free: Extract Pages or Separate a PDF Online",
    description:
      "Split a PDF into single pages or page ranges, or extract the pages you pick into a new file. Runs in your browser; nothing is uploaded.",
    h1: "Split a PDF into separate files",
    lead: "Save every page as its own PDF, cut the document into page ranges, or pull out just the pages you select. Several files download together as a ZIP.",
    steps: [
      "Choose the PDF you want to split.",
      "Pick a method: every page, page ranges, or selected pages.",
      "Select Split and download.",
    ],
    featureList: ["Split every page", "Split by page ranges", "Extract selected pages"],
    faq: [
      UPLOAD,
      {
        q: "How do I write page ranges?",
        a: "Separate ranges with commas. For example, 1-3, 4, 5-10 makes three files: pages 1 to 3, page 4, and pages 5 to 10.",
      },
      {
        q: "Why did I get a ZIP file?",
        a: "When a split produces more than one PDF, the files are packed into one ZIP so your browser downloads them together.",
      },
      FREE,
    ],
  },
  {
    id: "organize",
    howTo: "How to organize PDF pages",
    slug: "organize-pdf",
    nav: "Organize",
    name: "Organize PDF",
    entry: "/src/tools/organize.jsx",
    title: "Organize PDF Pages Free: Reorder, Delete and Add Pages",
    description:
      "Rearrange PDF pages by dragging, delete the ones you do not need, rotate pages and add pages from other PDFs. Free and private: files stay on your device.",
    h1: "Reorder, delete and rotate PDF pages",
    lead: "See every page at once, drag pages into a new order, remove the ones you do not need and add pages from other PDFs. Then download the new document.",
    steps: [
      "Choose a PDF. Add more files if you want to combine pages.",
      "Drag pages to reorder them, or use the page buttons to rotate or delete.",
      "Select Download to save the organized PDF.",
    ],
    featureList: [
      "Drag to reorder pages",
      "Delete pages",
      "Rotate single pages",
      "Add pages from other PDFs",
    ],
    faq: [
      UPLOAD,
      {
        q: "Can I reorder pages without a mouse?",
        a: "Yes. Each page has move earlier and move later buttons, which also work with a keyboard or a touch screen.",
      },
      {
        q: "How do I delete pages from a PDF?",
        a: "Select the delete button on each page you want to remove, then download. The deleted pages are not included in the new file.",
      },
      FREE,
    ],
  },
  {
    id: "rotate",
    howTo: "How to rotate a PDF",
    slug: "rotate-pdf",
    nav: "Rotate",
    name: "Rotate PDF",
    entry: "/src/tools/rotate.jsx",
    title: "Rotate PDF Free: Turn PDF Pages and Save Permanently",
    description:
      "Rotate all pages of a PDF or only the pages you pick, by 90 or 180 degrees, and save the result. Free, in your browser, with no upload.",
    h1: "Rotate PDF pages and save the result",
    lead: "Turn the whole document or individual pages, check the result in the preview, and download a PDF that opens the right way up everywhere.",
    steps: [
      "Choose the PDF with sideways or upside-down pages.",
      "Rotate all pages at once, or select a page to turn only that one.",
      "Select Download to save the rotated PDF.",
    ],
    featureList: ["Rotate all pages", "Rotate single pages", "90 and 180 degree turns"],
    faq: [
      UPLOAD,
      {
        q: "Is the rotation permanent?",
        a: "Yes. The rotation is written into the downloaded PDF, so it opens the same way in every viewer.",
      },
      {
        q: "Does rotating change the quality?",
        a: "No. Only the page rotation setting changes; the page content is copied as it was.",
      },
      FREE,
    ],
  },
  {
    id: "compress",
    howTo: "How to compress a PDF",
    slug: "compress-pdf",
    nav: "Compress",
    name: "Compress PDF",
    entry: "/src/tools/compress.jsx",
    title: "Compress PDF Free: Reduce PDF File Size Without Uploading",
    description:
      "Make a PDF smaller by recompressing its photos or rebuilding pages as images. See the new size before you download. Runs in your browser.",
    h1: "Reduce the file size of a PDF",
    lead: "Choose how hard to compress, see the new size before you download, and keep the original if the result is not smaller. Your file is processed in this tab and never uploaded.",
    steps: [
      "Choose the PDF you want to make smaller.",
      "Pick a level: Basic, Recommended or Strong.",
      "Select Compress, check the new size, then download.",
    ],
    featureList: [
      "Lossless clean-up",
      "Photo recompression that keeps text",
      "Strong mode for scanned documents",
    ],
    faq: [
      UPLOAD,
      {
        q: "What do the levels do?",
        a: "Basic rewrites the file without changing any content. Recommended also recompresses large JPEG photos and keeps text selectable. Strong turns every page into an image, which shrinks scans the most but removes selectable text.",
      },
      {
        q: "Why is my PDF not much smaller?",
        a: "Files that are mostly text, or whose images are already compressed, have little left to remove. In that case keep the original; the tool tells you when the result is not smaller.",
      },
      FREE,
    ],
  },
  {
    id: "jpg-to-pdf",
    howTo: "How to convert JPG to PDF",
    slug: "jpg-to-pdf",
    nav: "JPG to PDF",
    name: "JPG to PDF",
    entry: "/src/tools/images-to-pdf.jsx",
    title: "JPG to PDF Free: Convert Images to PDF in Your Browser",
    description:
      "Turn JPG, PNG and WebP images into one PDF. Choose page size, orientation and margins. Free, no sign-up, and images never leave your device.",
    h1: "Convert JPG images to PDF",
    lead: "Add photos or scans, put them in order, and save them as one PDF with a page per image. JPG files are placed as they are, without recompression.",
    steps: [
      "Choose or drop your JPG, PNG or WebP images.",
      "Drag them into order and pick a page size and margin.",
      "Select Convert and download.",
    ],
    featureList: [
      "JPG, PNG and WebP input",
      "A4, Letter or fit-to-image pages",
      "Original JPG quality",
    ],
    faq: [
      UPLOAD,
      {
        q: "Does converting reduce image quality?",
        a: "JPG images are embedded unchanged. PNG images are embedded losslessly. Other formats, such as WebP, are converted to PNG first.",
      },
      {
        q: "Can I convert iPhone HEIC photos?",
        a: "Only in browsers that can display HEIC, such as Safari. Elsewhere, export the photos as JPG first.",
      },
      FREE,
    ],
  },
  {
    id: "pdf-to-jpg",
    howTo: "How to convert PDF to JPG",
    slug: "pdf-to-jpg",
    nav: "PDF to JPG",
    name: "PDF to JPG",
    entry: "/src/tools/pdf-to-images.jsx",
    title: "PDF to JPG Free: Convert PDF Pages to Images Online",
    description:
      "Save each page of a PDF as a JPG or PNG image at the resolution you choose. Free and private: conversion happens in your browser.",
    h1: "Convert PDF pages to JPG images",
    lead: "Turn every page, or only the pages you pick, into JPG or PNG images. Choose a resolution for screens or for print. Several images download together as a ZIP.",
    steps: [
      "Choose the PDF you want to convert.",
      "Pick the format, resolution and pages.",
      "Select Convert and download.",
    ],
    featureList: ["JPG or PNG output", "72, 150 or 300 DPI", "Convert selected pages"],
    faq: [
      UPLOAD,
      {
        q: "Which resolution should I choose?",
        a: "150 DPI suits screens and email. 300 DPI suits printing but makes larger files. 72 DPI makes small previews.",
      },
      {
        q: "JPG or PNG?",
        a: "JPG makes smaller files and suits photos and scans. PNG keeps sharp edges on text and diagrams but is larger.",
      },
      FREE,
    ],
  },
  {
    id: "page-numbers",
    howTo: "How to add page numbers to a PDF",
    slug: "add-page-numbers",
    nav: "Page numbers",
    name: "Add page numbers",
    entry: "/src/tools/page-numbers.jsx",
    title: "Add Page Numbers to PDF Free, in Your Browser",
    description:
      "Number the pages of a PDF: choose the position, format, size and starting number, and skip a cover page. Preview before download. Nothing is uploaded.",
    h1: "Add page numbers to a PDF",
    lead: "Choose where the numbers go and how they read, check the preview on any page, and download the numbered PDF. Text on the pages stays selectable.",
    steps: [
      "Choose the PDF you want to number.",
      "Pick the position, format and first number. Skip the cover if you need to.",
      "Select Add numbers and download.",
    ],
    featureList: [
      "Six positions",
      "Formats such as Page 1 of 10",
      "Custom starting number",
      "Skip cover pages",
    ],
    faq: [
      UPLOAD,
      {
        q: "Can I start numbering on page 2?",
        a: "Yes. Set Number from page to 2 to leave the cover unnumbered, and set Start at to the number the first numbered page should show.",
      },
      {
        q: "Which characters can I use?",
        a: "Numbers are set in Helvetica, a standard PDF font, so prefixes such as Page or Seite work. Scripts outside Latin are not supported yet.",
      },
      FREE,
    ],
  },
  {
    id: "watermark",
    howTo: "How to watermark a PDF",
    slug: "watermark-pdf",
    nav: "Watermark",
    name: "Watermark PDF",
    entry: "/src/tools/watermark.jsx",
    title: "Add Watermark to PDF Free: Text Watermarks in Your Browser",
    description:
      "Stamp a text watermark such as DRAFT or CONFIDENTIAL on every PDF page. Set size, angle, color and transparency, and preview it first. No upload.",
    h1: "Add a text watermark to a PDF",
    lead: "Type the watermark, set its size, angle, color and transparency, preview it on the pages, and download the stamped PDF.",
    steps: [
      "Choose the PDF you want to watermark.",
      "Type the text and adjust its size, angle, color and transparency.",
      "Select Add watermark and download.",
    ],
    featureList: [
      "Custom watermark text",
      "Diagonal or straight",
      "Adjustable transparency",
      "Single or tiled",
    ],
    faq: [
      UPLOAD,
      {
        q: "Can the watermark be removed?",
        a: "The watermark is drawn into each page’s content, but anyone with a PDF editor can still remove it. For sensitive documents, also use redaction or share a flattened copy.",
      },
      {
        q: "Can I add an image watermark?",
        a: "Not in this tool yet. To place a logo, use the editor’s Image tool on the pages you need.",
      },
      FREE,
    ],
  },
];

export function toolUrl(tool) {
  return `${SITE.origin}${SITE.base}${tool.slug ? `${tool.slug}/` : ""}`;
}

export const PRIVACY_NOTE = PRIVACY;

export const CONTACT_EMAIL = "mle.ultimate@gmail.com";

// A static page with no app. Section text is trusted HTML because it holds links.
// Keep it matched to what the code does: see src/analytics.js before changing it.
export const PRIVACY_PAGE = {
  id: "privacy",
  slug: "privacy",
  name: "Privacy policy",
  entry: "/src/privacy.js",
  title: "Privacy Policy | PDF Editor",
  description:
    "How PDF Editor handles your data: files stay in your browser, and Google Analytics counts visits and tool use without file names or document contents.",
  h1: "Privacy policy",
  updated: "November 7, 2026",
  lead: "PDF Editor runs in your browser, so your files stay on your device. This page explains the small amount of usage data the site does collect, and who handles it.",
  sections: [
    {
      heading: "Your files",
      body: [
        "<p>Files you open are read and changed by your browser tab. They are not uploaded to any server, and this site does not store them. Closing or refreshing the tab discards them. File names, document text, images and signatures are never sent anywhere.</p>",
      ],
    },
    {
      heading: "Usage analytics",
      body: [
        "<p>This site uses Google Analytics 4 to count visits and see which tools are used. It records:</p>",
        `<ul>
              <li><strong>Pages.</strong> The page address, without any query string or fragment, and the origin of the site that sent you.</li>
              <li><strong>Actions.</strong> Events such as opening a PDF, running a tool, downloading a result, or a step failing.</li>
              <li><strong>Action details.</strong> The tool name, the option chosen, counts of pages, files and edits, and whether a download included a redaction.</li>
              <li><strong>Device details.</strong> Google Analytics uses the connection and browser details it receives to estimate your approximate location and device type.</li>
            </ul>`,
        "<p>Google signals and ad personalization are turned off. This site shows no ads and does not sell data.</p>",
      ],
    },
    {
      heading: "Cookies",
      body: [
        "<p>The site's own code sets no cookies and stores nothing in your browser. Google Analytics sets its own cookies, such as <code>_ga</code>, to recognize a returning browser and count visits.</p>",
        '<p>You can block them with your browser settings, a content blocker or Google\'s <a href="https://tools.google.com/dlpage/gaoptout">opt-out add-on</a>. Every tool keeps working if you do.</p>',
      ],
    },
    {
      heading: "Who else handles data",
      body: [
        `<ul>
              <li><strong>Google</strong> provides Google Analytics and may process data outside your country. See the <a href="https://policies.google.com/privacy">Google Privacy Policy</a>.</li>
              <li><strong>GitHub</strong> hosts this site on GitHub Pages and may log visitor IP addresses for security. See the <a href="https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement">GitHub Privacy Statement</a>.</li>
            </ul>`,
      ],
    },
    {
      heading: "How long data is kept",
      body: [
        "<p>Analytics event and user data is kept for 14 months, then deleted. Aggregated reports can remain after that.</p>",
      ],
    },
    {
      heading: "Your rights",
      body: [
        "<p>Depending on where you live, you may have rights to access, correct or delete personal data, or to object to its use. This site has no accounts and holds no names, so it usually cannot link analytics to you, but write to us and we will help where we can.</p>",
      ],
    },
    {
      heading: "Contact",
      body: [
        `<p>Send questions or requests to <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>. If this policy changes, the date at the top of this page changes too.</p>`,
      ],
    },
  ],
};
