/**
 * Public-site content for My Older Fitness, carried over from the trainer's
 * original site (myolderfitness.com). Change copy here; nothing else needs to.
 */
export const SITE = {
  name: "My Older Fitness",
  trainer: "Jervaughn Scales",
  trainerFirstName: "Jervaughn",
  copyrightYear: 2026,
  tagline: "Personal training for older adults in the Burlington, Vermont area.",
  description:
    "Personal training for older adults in the Burlington, Vermont area with Jervaughn Scales, an ACE-certified personal trainer and senior fitness specialist.",
  credentials: "ACE-Certified Personal Trainer & Senior Fitness Specialist · Former pro basketball player",
  location: "Greater Burlington, Vermont, at the YMCA or in your own home",
  /** The first paragraph doubles as the short "about me" on the home page. */
  about: [
    "I’m a certified personal trainer, and I help people of all ages reach their fitness goals, with a special focus on older adults. Whether you haven’t exercised in years, are coming back after an illness or injury, or simply want to stay strong and independent, we will start where you are and build from there.",
    "My approach is holistic. Every client gets a workout plan tailored to them, built around strength, flexibility and balance, with expert guidance on safe form in every session. We use weights, bands, ropes and whatever else suits you, and we adjust the plan as you get stronger.",
    "Before I coached others, I spent more than two decades as a professional athlete. I was born in New York City and grew up in Dayton, Ohio. I played college basketball for Southern University, where I was named Southwestern Athletic Conference Player of the Year, and then played professionally from 1994 to 2015, including 15 seasons in Argentina and two stints in Chile. Along the way I won a Chilean league title in 2004, the Argentine Liga Nacional in 2006 and the FIBA Americas League in 2008.",
    "That career taught me how bodies get stronger, how they recover, and how much encouragement matters. Today I bring the same discipline to training clients in the Greater Burlington, Vermont area, at the YMCA or in the comfort of your own home.",
  ],
  philosophy:
    "It is never too late to get stronger. Whatever your age or starting point, you can feel steadier and more capable in daily life, and I will encourage you every step of the way.",
  certifications: [
    "ACE Personal Trainer",
    "ACE Senior Fitness Specialist",
    "ACE Group Fitness Instructor",
    "NASM Corrective Exercise",
    "ACE Weight Management",
  ],
  assessmentNote: "Your first session includes a 15-minute assessment.",
  contactIntro:
    "Tell me a little about yourself and what you would like to achieve, and I will get back to you. Your first session includes a 15-minute assessment, so we start at exactly the right level for you.",
  /** Session packages. Per-session cost is derived, not stored. */
  prices: [
    { sessions: 1, total: 85 },
    { sessions: 5, total: 400 },
    { sessions: 10, total: 750 },
    { sessions: 15, total: 1050 },
  ],
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
} as const;

export const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/pricing", label: "Pricing" },
  { href: "/testimonials", label: "Testimonials" },
  { href: "/contact", label: "Contact" },
] as const;
