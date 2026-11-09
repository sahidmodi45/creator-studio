/** The nine jobs the assistant does. Safe to import from client components. */

export const CAPABILITIES = {
  ideas: {
    label: "Generate ideas",
    instruction:
      "Generate content ideas. For each: a name, the pillar and series it belongs to, the hook line, and one sentence on why it would work for this creator. Avoid anything already in the pipeline.",
    placeholder: "Five reel ideas for the festive season",
    needs: [],
  },
  script: {
    label: "Write a script",
    instruction:
      "Write a reel script in the creator's own voice, as words she would actually say out loud. Open with the hook. Keep it speakable and tight. Add brief shot notes in square brackets only where they help.",
    placeholder: "A 45 second recipe reel for a weeknight dinner",
    needs: ["content"],
  },
  caption: {
    label: "Write captions",
    instruction: "Write three caption options in the creator's voice. Vary the opening line. Use keywords people would search. Keep hashtags few and specific.",
    placeholder: "Anything the caption should mention",
    needs: ["content"],
  },
  analyse_reference: {
    label: "Analyse references",
    instruction:
      "Analyse the attached references: what makes them work (hook, pacing, framing, text on screen, colour, audio if described), and what specifically this creator could borrow without copying. Be concrete. Say clearly if you could only see still frames, and do not claim to have watched or heard anything you did not receive.",
    placeholder: "What should we take from this?",
    needs: ["assets"],
  },
  edit_suggestions: {
    label: "Suggest video edits",
    instruction:
      "Suggest specific edits to this video from the frames, script and notes provided: where to cut, what to reorder, text on screen, cover choice, and the first three seconds. You only see still frames, so do not comment on audio or exact timing you cannot verify.",
    placeholder: "It feels slow in the middle",
    needs: ["content", "assets"],
  },
  brand_review: {
    label: "Review against the brand",
    instruction:
      "Review this piece against the brand knowledge base. Say plainly what is on-brand, what is off-brand, and give the exact change for each problem. Quote the guideline you are applying.",
    placeholder: "Anything to look at in particular",
    needs: ["content"],
  },
  feed_aesthetics: {
    label: "Improve the feed",
    instruction:
      "Look at the feed layout provided, in grid order, three tiles per row. Suggest improvements to how it reads as a whole: rhythm of formats, colour, repetition, which tiles to swap, and which covers to change. Refer to tiles by row and column.",
    placeholder: "Does the top row work?",
    needs: ["feed"],
  },
  feedback_summary: {
    label: "Summarise feedback",
    instruction:
      "Summarise the client's feedback on this piece into a short list of changes the editor can act on, most important first. Separate what she clearly asked for from what you are inferring. Flag anything that conflicts.",
    placeholder: "Optional: what are you about to work on?",
    needs: ["content"],
  },
  request_to_brief: {
    label: "Turn a request into a brief",
    instruction:
      "Turn this creative request into a production brief: objective, pillar and series, format, hook options, shot list, voiceover or script direction, on-screen text, cover idea, caption direction, what we still need from the client, and a suggested timeline. Do not invent facts about the shoot; list unknowns as questions.",
    placeholder: "Anything to add",
    needs: ["request"],
  },
} as const;

export type CapabilityId = keyof typeof CAPABILITIES;
export const CAPABILITY_IDS = Object.keys(CAPABILITIES) as CapabilityId[];
export const MODEL = "claude-opus-5-5";
