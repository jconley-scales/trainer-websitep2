/**
 * Public-site content for My Older Fitness, carried over from the trainer's
 * original site (myolderfitness.com). Change copy here; nothing else needs to.
 */
export const SITE = {
  name: "My Older Fitness",
  trainer: "Jervaughn Scales",
  trainerFirstName: "Jervaughn",
  copyrightYear: 2026,
  tagline: "Personal training for older adults in Chittenden County, Vermont.",
  description:
    "Personal training for older adults in Chittenden County, Vermont, with Jervaughn Scales, an ACE-certified personal trainer and senior fitness specialist.",
  credentials: "ACE-Certified Personal Trainer & Senior Fitness Specialist · Former pro basketball player",
  location: "Chittenden County, Vermont, in the comfort of your own home",
  /** The first paragraph doubles as the short "about me" on the home page. */
  about: [
    "I’m a certified personal trainer, and I help people of all ages reach their fitness goals, with a special focus on older adults. Whether you haven’t exercised in years, are coming back after an illness or injury, or simply want to stay strong and independent, we will start where you are and build from there.",
    "My approach is holistic. Every client gets a workout plan tailored to them, built around strength, flexibility and balance, with expert guidance on safe form in every session. We use weights, bands, ropes and whatever else suits you, and we adjust the plan as you get stronger.",
    "Before I coached others, I spent more than two decades as a professional athlete. I was born in New York City and grew up in Dayton, Ohio. I played college basketball for Southern University, where I was named Southwestern Athletic Conference Player of the Year, and then played professionally from 1994 to 2015, including 15 seasons in Argentina and two stints in Chile. Along the way I won a Chilean league title in 2004, the Argentine Liga Nacional in 2006 and the FIBA Americas League in 2008.",
    "That career taught me how bodies get stronger, how they recover, and how much encouragement matters. Today I bring the same discipline to training clients across Chittenden County, Vermont, in the comfort of their own homes.",
  ],
  philosophy:
    "It is never too late to get stronger. Whatever your age or starting point, you can feel steadier and more capable in daily life, and I will encourage you every step of the way.",
  certifications: [
    "ACE Senior Fitness Specialist",
    "ACE Certified Personal Trainer",
    "NASM Corrective Exercise Specialist",
    "ACE Weight Management Specialist",
    "ACE Group Fitness Instructor",
    "Certified INSANITY Instructor",
  ],
  /** Short trust line for places too small for the full certification list. */
  certifiedBy: "Certified by ACE & NASM",
  assessmentNote: "Your first session includes a 15-minute assessment.",
  contactIntro:
    "Tell me a little about yourself and what you would like to achieve, and I will get back to you. Your first session includes a 15-minute assessment, so we start at exactly the right level for you.",
  /**
   * Session packages, one group per kind of training. Per-session cost is
   * derived, not stored. `firstSession` is an introductory price for a
   * group's very first single session, shown on its 1-session card.
   */
  pricing: [
    {
      id: "one-on-one",
      title: "1-on-1 training",
      intro: "Just you and your trainer.",
      prices: [
        { sessions: 1, total: 85 },
        { sessions: 5, total: 400 },
        { sessions: 10, total: 750 },
        { sessions: 15, total: 1050 },
      ],
    },
    {
      id: "partner",
      title: "Partner training",
      intro: "Train with a partner. Prices cover both of you.",
      firstSession: 85,
      prices: [
        { sessions: 1, total: 120 },
        { sessions: 5, total: 425 },
        { sessions: 10, total: 785 },
        { sessions: 15, total: 1125 },
      ],
    },
  ] as {
    id: string;
    title: string;
    intro: string;
    firstSession?: number;
    prices: { sessions: number; total: number }[];
  }[],
  /** Clients' own words, exactly as published on the original site. The first is the home-page preview. */
  testimonials: [
    {
      name: "Hank Prensky",
      quote: [
        "Jervaughn Scales is a great trainer, a professionally talented athlete, and a coach devoted to making me stronger, more flexible and (significantly for us “older adults”) capable of better balance! He’s the best!",
      ],
    },
    {
      name: "Elaine Kolitch",
      quote: [
        "I am pleased to write a testimonial about my experiences with Jervaughn as my personal trainer. Jervaughn and I have been training together twice a week in my home for the past 9 months. I am 83 years old and when we began I hadn’t exercised for quite some time because of various health issues; so I was weak, with poor balance and flexibility. Overall, I’m in much better shape now, definitely stronger and able to function better physically in my daily life. I attribute these changes to all the exercises, (using weights, bands and ropes) that I did with Jervaughn during the past year.",
        "Jervaughn is extremely knowledgeable about anatomy and the exercises needed to strengthen various parts of your body. He is highly professional to work with and is especially encouraging about your ability to improve and progress, regardless of your age. He is reliable and pleasant and makes the training a very positive experience. I look forward to our sessions, and plan to continue them in the future.",
      ],
    },
    {
      name: "Gretchen Rigol",
      quote: [
        "In 2021, I joined the Greater Burlington YMCA in hopes of regaining some physical fitness lost during the pandemic and other distractions. I thought some lessons about how to use the exercise equipment would be helpful, so I signed up for Personal Training. To my surprise, I was assigned to Jervaughn Scales, a former professional basketball player! I thought that was a gigantic mistake and that somebody had misread my background questionnaire (75-year-old female not in very good shape)—but I bravely decided to go through with the introductory session. That was one of the best decisions I’ve ever made.",
        "Since then, I’ve worked with Jervaughn on a regular basis. He really had to begin with very basic skills, but he persevered and so did I. A personal training session with Jervaughn is hard work, but fortunately also usually fun. Jervaughn is highly professional, really knows how to get his clients to improve, and—on top of all of his professional qualifications—is trustworthy and a good person.",
      ],
    },
    {
      name: "Tom Maffitt",
      quote: [
        "For the past three years, I have had the pleasure of working with Jervaughn as my personal trainer. Throughout this time, Jervaughn has consistently demonstrated an exceptional level of knowledge and skill in the field of fitness and personal training. From the very beginning, Jervaughn took the time to understand my specific goals and tailor a fitness routine that was not only effective but also safe. Each session was thoughtfully designed to challenge me while ensuring that I performed exercises with the correct form, thus minimizing the risk of injury.",
        "What sets Jervaughn apart is his ability to adapt and modify routines as my fitness level and goals evolved. His expertise in creating a balanced and comprehensive training program has been instrumental in helping me achieve significant progress over the years. Beyond his technical skills, Jervaughn is incredibly supportive and motivating. He has an innate ability to push me past my perceived limits while maintaining a positive and encouraging atmosphere. His dedication to my success is evident in every session, and I always leave feeling accomplished and motivated.",
        "In summary, I highly recommend Jervaughn to anyone seeking a knowledgeable, skilled, and supportive personal trainer. His commitment to creating safe, effective, and goal-oriented routines has made a profound impact on my fitness journey, and I am grateful for his guidance and expertise.",
      ],
    },
  ],
  /**
   * The privacy page (/privacy). Plain English, written for visitors. These
   * are promises: if how data is kept or handled changes, update this copy
   * and `updated`.
   */
  privacy: {
    updated: "November 8, 2026",
    /** Shown beside the booking and contact forms, linking here. */
    linkLabel: "How we use your details",
    lead: "What happens to the details you send me, in plain English.",
    sections: [
      {
        id: "privacy-collect",
        heading: "What I collect, and why",
        paragraphs: [
          "I only collect what you choose to send me through this website, apart from the basic visit logs every web host keeps (such as your device’s internet address):",
        ],
        items: [
          "When you request a session: your name, email address, phone number if you give one, the time you picked, and any note you add.",
          "When you send a message: your name, email address, phone number if you give one, and your message.",
        ],
        afterList: [
          "I use these details only to arrange and confirm your sessions and to reply to you. That is all.",
          "When I confirm or cancel your session, you get an email about it at the address you gave.",
          "This site has no advertising or tracking cookies, and it does not follow you to other websites. It works the same whether or not your browser sends a “Do Not Track” signal.",
        ],
      },
      {
        id: "privacy-health",
        heading: "Health details are up to you",
        paragraphs: [
          "You never have to share health details through this website. The note on a booking is optional, so share only what you’re comfortable sending. If there is something I should know before we start, we can talk it through at your first session.",
        ],
      },
      {
        id: "privacy-sharing",
        heading: "Who else handles your details",
        paragraphs: [
          "A few trusted services help me run this website. They handle your details only to do that job for me:",
        ],
        items: [
          "Supabase stores booking requests in a secure database.",
          "Vercel hosts the website.",
          // Update this line if the site's email provider (SMTP_* settings) changes.
          "Gmail delivers the emails about booking requests and messages, including the emails confirming or cancelling your session, and keeps copies in my inbox.",
        ],
        afterList: [
          "I never sell your information, and I never share it with anyone for marketing.",
        ],
      },
      {
        id: "privacy-keeping",
        heading: "How long I keep your details",
        paragraphs: [
          "Messages from the contact form are not stored on this website. They arrive in my email, and I keep them only as long as I need them to help you.",
          "I keep booking requests, and the emails about them, while we’re working together and for up to two years after your last session. Then I delete them. If you’d like yours deleted sooner, just ask.",
        ],
      },
      {
        id: "privacy-choices",
        heading: "Seeing or deleting your details",
        paragraphs: [
          "You can ask to see or delete the details I hold about you, or to correct anything that is wrong. Just send me a message through the contact form and tell me what you would like. I will take care of it and let you know when it is done.",
        ],
        cta: { href: "/contact", label: "Send Jervaughn a message" },
      },
      {
        id: "privacy-changes",
        heading: "If this page changes",
        paragraphs: [
          "If I change how I handle your details, I will update this page and the date at the top.",
        ],
      },
    ] as {
      id: string;
      heading: string;
      paragraphs: string[];
      items?: string[];
      /** Paragraphs that follow the bulleted list. */
      afterList?: string[];
      /** A button-styled link closing the section. */
      cta?: { href: string; label: string };
    }[],
  },
} as const;

export const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/pricing", label: "Pricing" },
  { href: "/testimonials", label: "Testimonials" },
  { href: "/contact", label: "Contact" },
] as const;
