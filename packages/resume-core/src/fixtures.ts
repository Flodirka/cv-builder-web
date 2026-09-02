import type { Resume } from "./schema";

export const englishSampleResume: Resume = {
  language: "en",
  person: {
    fullName: "Alex Doe",
    headline: "Senior Game Designer",
    email: "alex@example.com",
    location: "Remote",
    links: [{ label: "Portfolio", url: "https://example.com" }]
  },
  summary: "Senior game designer focused on systems, economy and live operations.",
  experience: [
    {
      title: "Senior Game Designer",
      subtitle: "Example Studio",
      start: "2021",
      end: "Present",
      location: "Remote",
      bullets: [
        "Owned feature specs from pitch to release.",
        "Balanced economy loops and progression."
      ]
    },
    {
      title: "Lead Game Designer",
      subtitle: "Prototype Team",
      start: "2019",
      end: "2021",
      location: "Berlin",
      bullets: [
        "Led a small design pod across core loop, onboarding and feature documentation.",
        "Turned ambiguous product goals into testable systems and release-ready specs."
      ]
    }
  ],
  education: [
    {
      title: "Computer Systems",
      subtitle: "State University",
      end: "2019",
      bullets: []
    }
  ],
  projects: [
    {
      title: "Portfolio Case Studies",
      subtitle: "Selected work",
      bullets: ["Documented combat, progression and live-ops design decisions."]
    }
  ],
  skills: [{ group: "Design", items: ["Systems design", "Economy", "Live ops"] }],
  languages: [{ name: "English", level: "C1" }],
  certificates: [
    { title: "Game Design Course", subtitle: "Online Academy", end: "2024", bullets: [] }
  ],
  customSections: [
    { title: "Additional Information", items: ["Writes about game design and productivity."] }
  ],
  layoutBlocks: []
};

export const russianSampleResume: Resume = {
  language: "ru",
  person: {
    fullName: "Иван Иванов",
    headline: "Старший геймдизайнер",
    email: "ivan@example.com",
    location: "Удаленно",
    links: [{ label: "Портфолио", url: "https://example.com" }]
  },
  summary: "Геймдизайнер с опытом системного дизайна, экономики и live-ops процессов.",
  experience: [
    {
      title: "Старший геймдизайнер",
      subtitle: "Студия Пример",
      start: "2021",
      end: "настоящее время",
      location: "Удаленно",
      bullets: ["Вел фичи от концепции до релиза.", "Балансировал экономику и прогрессию."]
    },
    {
      title: "Ведущий геймдизайнер",
      subtitle: "Команда Прототипов",
      start: "2019",
      end: "2021",
      location: "Берлин",
      bullets: [
        "Вел небольшую дизайн-команду по основному циклу, онбордингу и документации фич.",
        "Переводил продуктовые цели в проверяемые системы и готовые к релизу спеки."
      ]
    }
  ],
  education: [
    {
      title: "Компьютерные системы",
      subtitle: "Государственный университет",
      end: "2019",
      bullets: []
    }
  ],
  projects: [
    {
      title: "Портфолио кейсов",
      subtitle: "Избранные работы",
      bullets: ["Описал решения по боевой системе, прогрессии и live-ops дизайну."]
    }
  ],
  skills: [{ group: "Дизайн", items: ["Системный дизайн", "Экономика", "Live-ops"] }],
  languages: [
    { name: "Русский", level: "родной" },
    { name: "Английский", level: "C1" }
  ],
  certificates: [
    { title: "Курс по геймдизайну", subtitle: "Онлайн-академия", end: "2024", bullets: [] }
  ],
  customSections: [{ title: "Дополнительно", items: ["Пишет о геймдизайне и продуктивности."] }],
  layoutBlocks: []
};
