export const resumeWritingTips = [
  {
    title: "Contacts",
    text: "Use your name, email, phone and relevant portfolio links. Check every link and omit personal details the employer does not need."
  },
  {
    title: "Summary",
    text: "Use two or three sentences to explain your role, relevant experience and strongest evidence. Replace generic claims with specific work you have done."
  },
  {
    title: "Experience",
    text: "For most resumes, list the most recent role first. Include employer, title and consistent dates. Describe your action and the result; use numbers only when you can verify them."
  },
  {
    title: "Skills and education",
    text: "List skills you can demonstrate, relevant qualifications and required licences. Match the vacancy's wording where it describes your actual experience."
  },
  {
    title: "Before sending",
    text: "Replace every fictional example with your own facts. Follow the employer's form, language and length requirements. Check the exported PDF for page breaks, readable text and working links."
  }
] as const;

export const regionalResumeTips = [
  {
    name: "USA",
    text: "Minimal or Standard is a suitable starting point. Prefer a clear chronology and omit a photo and unnecessary personal details. Federal and other employer-specific applications may have separate instructions. This editor exports A4; use the employer's required page size if it differs.",
    source: "https://cloudfront.careeronestop.org/JobSearch/Resumes/ResumeGuide/formatting.aspx"
  },
  {
    name: "Australia",
    text: "Include relevant skills, recent jobs and required licences. Provide referees only when requested and with their consent. Follow the vacancy's length requirements rather than a fixed rule based on years of experience.",
    source:
      "https://www.workforceaustralia.gov.au/content/online-learning/course/what-needs-to-be-in-your-resume/assets/Resume%20planner.pdf"
  },
  {
    name: "Europe",
    text: "The Europe template uses Europass-style sections. It is an editable example, not an official Europass export. Include relevant education, work and language skills; use the official Europass service when that exact format is requested.",
    source: "https://europass.europa.eu/en/create-europass-cv"
  },
  {
    name: "Japan",
    text: "Japan is a two-page A4 rirekisho example with editable tables and Japanese text. Keep education and employment in chronological order, grouped separately. Update name readings, dates, qualifications, motivation and preferences. Sex is optional in the MHLW sample; add a photo when required. Use the employer's form when specified. A separate shokumu keirekisho may also be requested.",
    source: "https://www.hellowork.mhlw.go.jp/member/career_doc01.html"
  },
  {
    name: "Canada and UK",
    text: "Keep recent, relevant experience and clear contact details. Check local and employer instructions before adding a photo or personal information; do not assume a single required national form.",
    source: "https://www.jobbank.gc.ca/findajob/resources/write-good-resume"
  },
  {
    name: "China and South Korea",
    text: "Check the employer's application form and any separate personal statement. There is no claim of compatibility with a universal national form here. The bundled Japanese font does not provide complete Chinese or Korean font coverage.",
    source:
      "https://www.work24.go.kr/cm/c/d/0180/retrieveSiteEasyDetailHpcm.do?tycd=E6T00&utzeGuidId=GUID000102"
  }
] as const;

export const achievementExample =
  "Fictional example: Redesigned tutorial progression after six playtests, reducing first-session drop-off from 32% to 24%. Use your own confirmed action and result; a concrete non-numeric result is fine.";
