/**
 * Original reflections inspired by the linked passages, not scripture quotations.
 * Minutes are suggested practice time, not measured reading time.
 * See docs/content-sources.md for editorial decisions and publication limits.
 */
export type Source = "bible" | "book-of-mormon";

export const sourceLabels: Readonly<Record<Source, string>> = {
  bible: "Bible · KJV",
  "book-of-mormon": "Book of Mormon",
};

export const categories = [
  "Compassion",
  "Patience",
  "Honesty",
  "Forgiveness",
  "Gratitude",
  "Rest",
  "Service",
  "Peacemaking",
  "Humility",
  "Stewardship",
  "Perseverance",
  "Belonging",
] as const;

export type Category = (typeof categories)[number];

export interface Practice {
  /** Stable URL slug. Keep existing IDs when revising the wording. */
  id: string;
  title: string;
  source: Source;
  reference: string;
  summary: string;
  /** Original plain-language explanation, not a scripture quotation. */
  plainMeaning: string;
  /** An illustrative everyday situation, not a testimonial or biblical event. */
  everydayExample: string;
  /** Editorial message preview; not a provider-validated single SMS segment. */
  smsText: string;
  action: string;
  reflection: string;
  category: Category;
  minutes: number;
  sourceUrl: string;
}

export const practices: readonly Practice[] = [
  {
    id: "notice-your-neighbour",
    title: "Notice your neighbour",
    source: "bible",
    reference: "Luke 10:33–37",
    plainMeaning:
      "Compassion means noticing another person's difficulty and offering useful care. Jesus shows that being a neighbour is something we do, even for someone outside our usual circle.",
    everydayExample:
      "A neighbour arrives home carrying groceries while trying to open the building door. You ask whether they would like you to hold the door or carry one bag.",
    smsText:
      "Bible (KJV) - Luke 10:33–37. Compassion means noticing a need and offering care. See a neighbour carrying groceries? Ask if they would like help with a bag.",
    summary:
      "In the Good Samaritan story, compassion becomes practical care. Being a neighbour begins with noticing someone whose need might otherwise be easy to pass by.",
    action:
      "Look for one small need around you today. Ask whether a specific help would be welcome, and respect the answer.",
    reflection: "What changed when you asked what was needed instead of assuming?",
    category: "Compassion",
    minutes: 5,
    sourceUrl:
      "https://www.churchofjesuschrist.org/study/scriptures/nt/luke/10?lang=eng&id=p33-p37#p33",
  },
  {
    id: "listen-before-answering",
    title: "Listen before answering",
    source: "bible",
    reference: "James 1:19",
    plainMeaning:
      "Patience in conversation means making room to understand before reacting. James encourages listening readily while slowing down our words and anger.",
    everydayExample:
      "A friend describes a difficult workday, and you want to jump in with advice. You let them finish and ask whether they want ideas or simply someone to listen.",
    smsText:
      "Bible (KJV) - James 1:19. Listen before reacting. When a friend describes a hard day, let them finish; then ask whether they want advice or someone to listen.",
    summary:
      "James connects attentive listening with restraint in speech and anger. Making room for another person can begin with a pause before your reply.",
    action:
      "In your next conversation, let the other person finish without interrupting. Ask one question about what they said before offering advice.",
    reflection: "What did you hear when you stopped preparing your next answer?",
    category: "Patience",
    minutes: 3,
    sourceUrl:
      "https://www.churchofjesuschrist.org/study/scriptures/nt/james/1?lang=eng&id=p19#p19",
  },
  {
    id: "tell-the-truth-kindly",
    title: "Tell the truth kindly",
    source: "bible",
    reference: "Ephesians 4:25",
    plainMeaning:
      "Honesty means giving people an accurate account instead of hiding a mistake or shifting blame. Paul connects truthful speech with our responsibility to each other.",
    everydayExample:
      "You forgot to send a file that a coworker was waiting for. Instead of blaming your email, you acknowledge the oversight and give a realistic time to send it.",
    smsText:
      "Bible (KJV) - Ephesians 4:25. Honesty builds everyday trust. Forgot to send a promised file? Acknowledge it without an excuse and give a realistic time to send it.",
    summary:
      "Paul places truthful speech within our responsibility to one another. Honesty can strengthen everyday trust when it is clear, respectful, and willing to own a mistake.",
    action:
      "Correct one small misunderstanding you helped create. State what happened, take responsibility for your part, and say what you can realistically do next.",
    reflection: "Where could a little more honesty make a relationship clearer?",
    category: "Honesty",
    minutes: 5,
    sourceUrl: "https://www.churchofjesuschrist.org/study/scriptures/nt/eph/4?lang=eng&id=p25#p25",
  },
  {
    id: "forgive-with-boundaries",
    title: "Make room for forgiveness",
    source: "bible",
    reference: "Ephesians 4:32",
    plainMeaning:
      "Forgiveness means working toward releasing resentment instead of repaying a hurt, following God's forgiveness through Christ. It does not require excusing harm, restoring trust, or contacting someone unsafe.",
    everydayExample:
      "A friend apologizes after forgetting a plan, but you still feel annoyed. You choose not to embarrass them in the group chat and ask them to confirm future plans.",
    smsText:
      "Bible (KJV) - Ephesians 4:32. Forgiveness can begin without retaliation. If a friend forgets a plan, avoid a public put-down and state what you need next time. Keep safe boundaries; no unsafe contact is required.",
    summary:
      "This passage invites kindness, compassion, and forgiveness. Practising forgiveness can be gradual; our suggested practice does not require excusing harm, restoring trust, or contacting someone unsafe.",
    action:
      "Choose a minor hurt you feel ready to consider. Write one sentence about how you could avoid retaliation while keeping the boundary you need; you do not have to send it.",
    reflection: "What would kindness toward yourself look like alongside forgiveness?",
    category: "Forgiveness",
    minutes: 5,
    sourceUrl: "https://www.churchofjesuschrist.org/study/scriptures/nt/eph/4?lang=eng&id=p32#p32",
  },
  {
    id: "notice-one-good-thing",
    title: "Notice one good thing",
    source: "bible",
    reference: "1 Thessalonians 5:18",
    plainMeaning:
      "Gratitude means noticing and appreciating something good, even during a difficult day. It does not mean calling a painful situation good or pretending nothing is wrong.",
    everydayExample:
      "Your commute is delayed, but a coworker shares the notes from the meeting you missed. You thank them for that specific help instead of treating the whole day as a loss.",
    smsText:
      "Bible (KJV) - 1 Thessalonians 5:18. Gratitude notices good without denying difficulty. A coworker shared notes after you missed a meeting? Send a specific thank-you.",
    summary:
      "Paul encourages a practice of gratitude within everyday life. Our reflection invites you to notice what is good without pretending that difficult things are easy or welcome.",
    action:
      "Write down one specific thing you appreciated today. If someone made it possible, send a short thank-you naming what they did.",
    reflection: "What small good thing might you otherwise have missed?",
    category: "Gratitude",
    minutes: 2,
    sourceUrl:
      "https://www.churchofjesuschrist.org/study/scriptures/nt/1-thes/5?lang=eng&id=p18#p18",
  },
  {
    id: "make-room-for-rest",
    title: "Make room for rest",
    source: "bible",
    reference: "Mark 6:31",
    plainMeaning:
      "Rest means allowing time to stop working and recover your attention. Jesus invited his busy disciples to step away; being needed does not make every moment a work moment.",
    everydayExample:
      "You finish a busy shift and immediately start answering nonurgent messages. You put the phone aside and sit quietly for five minutes before choosing the next task.",
    smsText:
      "Bible (KJV) - Mark 6:31. Rest makes space to pause after work. Reaching for nonurgent messages after a busy shift? Put the phone aside and take five quiet minutes if your responsibilities allow.",
    summary:
      "When the disciples return from their work, Jesus invites them to step away and rest. Care for others can include making space to pause ourselves.",
    action:
      "Choose a five-minute pause when your responsibilities allow it. Put aside one nonurgent task and spend that time without a screen or another job to finish.",
    reflection: "What could you put down briefly without neglecting what matters?",
    category: "Rest",
    minutes: 5,
    sourceUrl: "https://www.churchofjesuschrist.org/study/scriptures/nt/mark/6?lang=eng&id=p31#p31",
  },
  {
    id: "do-good-quietly",
    title: "Do good quietly",
    source: "bible",
    reference: "Matthew 6:3–4",
    plainMeaning:
      "Quiet generosity means helping because a person needs care, rather than to collect praise. A gift can matter without becoming a story about the giver.",
    everydayExample:
      "A local collection asks for winter gloves, and you have a clean spare pair. You contribute them without photographing the recipient or posting about your donation.",
    smsText:
      "Bible (KJV) - Matthew 6:3–4. Give to help, not to collect praise. A local collection needs gloves? If you have a suitable spare pair, offer them without making the recipient part of a social-media post.",
    summary:
      "Jesus teaches giving to people in need without making recognition the goal. Our practice applies that teaching to a small, useful gift.",
    action:
      "If you have something suitable to spare, check what a community collection actually needs. Offer one useful item within your means without seeking public credit.",
    reflection: "How did the action feel when recognition was not the goal?",
    category: "Service",
    minutes: 5,
    sourceUrl:
      "https://www.churchofjesuschrist.org/study/scriptures/nt/matt/6?lang=eng&id=p3-p4#p3",
  },
  {
    id: "take-a-step-toward-peace",
    title: "Take a step toward peace",
    source: "bible",
    reference: "Matthew 5:9",
    plainMeaning:
      "Peacemaking means taking a constructive step toward resolving a disagreement. It is different from pretending there is no problem or accepting harmful treatment.",
    everydayExample:
      "You and a housemate disagree about dishes left in the sink. At a calm moment, you explain how the mess affects you and suggest agreeing on a simple washing-up routine.",
    smsText:
      "Bible (KJV) - Matthew 5:9. Peacemaking addresses a problem without attacking a person. Disagreeing with a housemate about dishes? Choose a calm time and suggest a shared washing-up routine.",
    summary:
      "Jesus honours those who make peace. In an ordinary disagreement, a peaceful next step can involve listening, naming a shared concern, or choosing a calmer time to talk.",
    action:
      "For one low-stakes disagreement, write a sentence naming the problem without an insult. Add one workable request, such as agreeing on a time or sharing a task.",
    reflection: "What would help this conversation become safer and more constructive?",
    category: "Peacemaking",
    minutes: 3,
    sourceUrl: "https://www.churchofjesuschrist.org/study/scriptures/nt/matt/5?lang=eng&id=p9#p9",
  },
  {
    id: "choose-a-gentle-answer",
    title: "Choose a gentle answer",
    source: "bible",
    reference: "Proverbs 15:1",
    plainMeaning:
      "A gentle answer states a concern without adding an insult or threat. Your tone may reduce tension, but it cannot guarantee another person will respond well.",
    everydayExample:
      "A family member sends a sharp message about a missed call. You replace a sarcastic reply with a clear explanation and a time when you are available to talk.",
    smsText:
      "Bible (KJV) - Proverbs 15:1. Answer firmly without adding an insult. Got a sharp message about a missed call? Replace sarcasm with a clear explanation and a time you can talk; keep needed boundaries.",
    summary:
      "Proverbs contrasts a gentle answer with words that intensify anger. Our tone is something we can practise, even though we cannot control another person’s response.",
    action:
      "Reread one tense message before sending it. Remove a jab or accusation, explain your concern clearly, and keep any necessary boundary.",
    reflection: "Can your words be both gentle and honest?",
    category: "Peacemaking",
    minutes: 2,
    sourceUrl: "https://www.churchofjesuschrist.org/study/scriptures/ot/prov/15?lang=eng&id=p1#p1",
  },
  {
    id: "make-space-for-another-view",
    title: "Make space for another view",
    source: "bible",
    reference: "Philippians 2:3–4",
    plainMeaning:
      "Humility means remembering that your needs and ideas are not the only ones in the room. Paul invites concern for other people's interests as well as our own.",
    everydayExample:
      "You want a late meeting, but a teammate needs to collect their child. Before choosing the time, you ask what would work for them and explain your own constraints.",
    smsText:
      "Bible (KJV) - Philippians 2:3–4. Humility makes room for others' needs. Before booking a late meeting, ask about your teammate's availability and look for a time that respects both schedules.",
    summary:
      "Paul encourages humility and attention to the interests of others. You can take another person seriously without erasing your own needs or convictions.",
    action:
      "Before making one shared decision, ask how it affects the other person. Include one concern from their answer when you suggest a way forward.",
    reflection: "What did their perspective add to your own?",
    category: "Humility",
    minutes: 5,
    sourceUrl:
      "https://www.churchofjesuschrist.org/study/scriptures/nt/philip/2?lang=eng&id=p3-p4#p3",
  },
  {
    id: "put-a-gift-to-good-use",
    title: "Put a gift to good use",
    source: "bible",
    reference: "1 Peter 4:10",
    plainMeaning:
      "Stewardship means taking care of what you have been given and using it responsibly. Peter encourages using our abilities to serve other people.",
    everydayExample:
      "You are comfortable editing documents, and a friend is preparing a job application. You offer to check one paragraph rather than promising to rewrite everything.",
    smsText:
      "Bible (KJV) - 1 Peter 4:10. Use an ability to help someone. Good at proofreading? Offer to check one paragraph of a friend's application, with their permission and within your time.",
    summary:
      "Peter describes gifts as something to care for and use in service. An ordinary skill, a little time, or careful attention can be valuable to someone else.",
    action:
      "Offer someone ten minutes of a skill you already have, such as proofreading or explaining a tool. Be clear about the help and time you can give.",
    reflection: "Which ability do you tend to overlook because it feels ordinary to you?",
    category: "Stewardship",
    minutes: 10,
    sourceUrl:
      "https://www.churchofjesuschrist.org/study/scriptures/nt/1-pet/4?lang=eng&id=p10#p10",
  },
  {
    id: "return-to-one-good-habit",
    title: "Return to one good habit",
    source: "bible",
    reference: "Galatians 6:9–10",
    plainMeaning:
      "Perseverance means returning to something worthwhile when continuing feels difficult. Paul encourages doing good when opportunities arise; a missed day does not prevent the next helpful step.",
    everydayExample:
      "You meant to check in regularly with a relative but have missed several weeks. Instead of waiting until you can make a long call, you send a short, thoughtful message.",
    smsText:
      "Bible (KJV) - Galatians 6:9–10. Keep returning to what is good. Missed your usual check-in with a relative? Send one thoughtful message today instead of waiting for a perfect routine.",
    summary:
      "Paul encourages people to continue doing good as opportunities arise. A missed day does not have to become a reason to stop practising something worthwhile.",
    action:
      "Restart one useful habit with a step that fits today. For example, send a brief check-in instead of waiting for enough time for a long conversation.",
    reflection: "What makes a good habit easier to return to?",
    category: "Perseverance",
    minutes: 3,
    sourceUrl:
      "https://www.churchofjesuschrist.org/study/scriptures/nt/gal/6?lang=eng&id=p9-p10#p9",
  },
  {
    id: "serve-someone-nearby",
    title: "Serve someone nearby",
    source: "book-of-mormon",
    reference: "Mosiah 2:17",
    plainMeaning:
      "Service means using some of your time or effort to help another person. King Benjamin teaches that caring for people is also a way of serving God.",
    everydayExample:
      "After a shared meal, one person is doing all the cleaning. You ask which job would help most and take care of that job before leaving.",
    smsText:
      "Book of Mormon - Mosiah 2:17. Helping people is a way to serve God. One person is cleaning after a shared meal? Ask which small job would help, then take care of it.",
    summary:
      "King Benjamin connects serving other people with serving God. An everyday opportunity to help can become a meaningful expression of faith.",
    action:
      "At home, work, or a shared activity, offer to take one small task from someone's workload. Ask first, then finish the task you agree to do.",
    reflection: "Where was an opportunity to serve already close at hand?",
    category: "Service",
    minutes: 5,
    sourceUrl:
      "https://www.churchofjesuschrist.org/study/scriptures/bofm/mosiah/2?lang=eng&id=p17#p17",
  },
  {
    id: "choose-a-sustainable-pace",
    title: "Choose a sustainable pace",
    source: "book-of-mormon",
    reference: "Mosiah 4:27",
    plainMeaning:
      "A sustainable pace means doing good with the time and strength you actually have. King Benjamin pairs effort with wisdom rather than expecting people to work beyond their capacity.",
    everydayExample:
      "You have promised to bake for an event, help a friend move, and finish urgent work on the same evening. You tell the organizer you can bring a simpler contribution instead.",
    smsText:
      "Book of Mormon - Mosiah 4:27. Do good at a pace your strength allows. Overcommitted to baking and helping a friend move? Simplify one task and tell the people affected what you can manage.",
    summary:
      "King Benjamin pairs diligence with wisdom about our capacity. Doing good does not require pretending that your time and energy have no limits.",
    action:
      "Look at today's commitments and choose one nonessential task to simplify or move. Tell anyone affected, and make a realistic promise you can keep.",
    reflection: "What is a faithful, realistic amount for today?",
    category: "Rest",
    minutes: 3,
    sourceUrl:
      "https://www.churchofjesuschrist.org/study/scriptures/bofm/mosiah/4?lang=eng&id=p27#p27",
  },
  {
    id: "share-what-you-can",
    title: "Share what you can",
    source: "book-of-mormon",
    reference: "Mosiah 4:24–26",
    plainMeaning:
      "Generosity means responding to a real need with what you can reasonably give. This passage also recognizes that someone without enough to give can still care about another person.",
    everydayExample:
      "A neighbour is short of groceries, but your own budget is tight. You ask whether a spare unopened food item or help finding a nearby food program would be useful.",
    smsText:
      "Book of Mormon - Mosiah 4:24–26. Care for a need within your means. A neighbour needs groceries and money is tight? Ask if a spare food item or help finding a food program would be useful; protect your essentials.",
    summary:
      "King Benjamin calls for care that responds to real needs and acknowledges what a person has available. Generosity can be thoughtful and proportionate to your circumstances.",
    action:
      "Ask what would help before offering something. Choose a useful item, a little time, or information you can share without giving up your own essentials.",
    reflection: "How can you respond to a real need with what is available to you?",
    category: "Compassion",
    minutes: 10,
    sourceUrl:
      "https://www.churchofjesuschrist.org/study/scriptures/bofm/mosiah/4?lang=eng&id=p24-p26#p24",
  },
  {
    id: "be-present-in-grief",
    title: "Be present in grief",
    source: "book-of-mormon",
    reference: "Mosiah 18:8–9",
    plainMeaning:
      "Comfort means being willing to share someone's sadness and offer support. You do not have to explain their loss or make them stop feeling it.",
    everydayExample:
      "A coworker returns after a bereavement, and you are unsure what to say. You acknowledge the loss and offer to cover one small task, without asking them to tell the whole story.",
    smsText:
      "Book of Mormon - Mosiah 18:8–9. Comfort can mean presence, not an explanation. A coworker is grieving? Acknowledge their loss and offer help with one task, without pressing them to talk.",
    summary:
      "While inviting people to commit themselves to God, Alma describes a community willing to share burdens and offer comfort. Our practical application is to be present with someone in grief without trying to explain their pain.",
    action:
      "Send one gentle check-in to someone facing a loss or hard day. Offer a specific practical help and make clear that they do not need to reply or talk about it.",
    reflection: "What does supportive presence look like for this particular person?",
    category: "Compassion",
    minutes: 5,
    sourceUrl:
      "https://www.churchofjesuschrist.org/study/scriptures/bofm/mosiah/18?lang=eng&id=p8-p9#p8",
  },
  {
    id: "begin-with-one-small-step",
    title: "Begin with one small step",
    source: "book-of-mormon",
    reference: "Alma 37:6–7",
    plainMeaning:
      "A small beginning can be worth making even when it does not look impressive. Alma connects small means with God's larger purposes, not a promise that every small task will have a dramatic result.",
    everydayExample:
      "You want to repair a strained but safe friendship and keep putting off the conversation. You begin by writing one sincere opening sentence without pressuring yourself to solve everything at once.",
    smsText:
      "Book of Mormon - Alma 37:6–7. Small beginnings can matter. Putting off a conversation in a safe friendship? Take two minutes to write one sincere opening sentence; you do not need to solve everything at once.",
    summary:
      "While discussing the care of sacred records, Alma explains that God can work through small means. Our practical application is to begin a worthwhile task with a modest, useful step.",
    action:
      "Pick one worthwhile task you have postponed. Spend two minutes on its smallest useful beginning, such as writing the first sentence of a message.",
    reflection: "What became possible when you made the beginning smaller?",
    category: "Perseverance",
    minutes: 2,
    sourceUrl:
      "https://www.churchofjesuschrist.org/study/scriptures/bofm/alma/37?lang=eng&id=p6-p7#p6",
  },
  {
    id: "practise-patience-in-a-delay",
    title: "Practise patience in a delay",
    source: "book-of-mormon",
    reference: "Alma 7:23",
    plainMeaning:
      "Patience means choosing your response when something takes longer than you want. Alma encourages gentleness and patience alongside gratitude, without requiring you to ignore a genuine problem.",
    everydayExample:
      "The checkout line stops while a cashier solves a problem. You keep your voice respectful and ask about another open till instead of taking your frustration out on them.",
    smsText:
      "Book of Mormon - Alma 7:23. Patience chooses a respectful response. Stuck in a checkout queue? Pause, then ask calmly whether another till is open instead of blaming the cashier.",
    summary:
      "Alma encourages gentleness, patience, and gratitude. A small interruption can offer a place to practise these qualities without denying your frustration.",
    action:
      "At the next minor delay, pause before speaking. Ask for what you need respectfully and avoid blaming a person who is trying to help.",
    reflection: "What helped you respond deliberately instead of immediately?",
    category: "Patience",
    minutes: 2,
    sourceUrl:
      "https://www.churchofjesuschrist.org/study/scriptures/bofm/alma/7?lang=eng&id=p23#p23",
  },
  {
    id: "let-care-become-action",
    title: "Let care become action",
    source: "book-of-mormon",
    reference: "Alma 34:28–29",
    plainMeaning:
      "Practical care means doing something useful when you are able, rather than stopping at kind words. Amulek teaches that prayer should be accompanied by concern for people in need.",
    everydayExample:
      "A friend recovering at home says that grocery shopping is difficult. Before your next shop, you ask whether you could pick up a few items and agree on the details.",
    smsText:
      "Book of Mormon - Alma 34:28–29. Let concern lead to useful care when you can. A friend cannot get to the shops? Ask if you can pick up a few items during your own trip and agree on the details.",
    summary:
      "Amulek links prayer with practical concern for people in need. Caring words can be accompanied by a useful act when you have the capacity to offer one.",
    action:
      "Think of someone you have expressed concern for. Offer one specific, manageable help and follow through only on what they welcome and you can provide.",
    reflection: "What is one way your concern can become useful care?",
    category: "Service",
    minutes: 10,
    sourceUrl:
      "https://www.churchofjesuschrist.org/study/scriptures/bofm/alma/34?lang=eng&id=p28-p29#p28",
  },
  {
    id: "close-the-day-with-gratitude",
    title: "Close the day with gratitude",
    source: "book-of-mormon",
    reference: "Alma 37:37",
    plainMeaning:
      "Gratitude means noticing help you have received and remembering to give thanks. Alma speaks of trusting God at night and giving thanks in the morning; this evening reflection is our suggested way to practise that attention.",
    everydayExample:
      "At bedtime you are still thinking about an unfinished task. You also remember that a friend checked on you, and make a note to thank them the next morning.",
    smsText:
      "Book of Mormon - Alma 37:37. Remember help and give thanks. Still thinking about unfinished work at bedtime? Also name one kindness from today and plan to thank the person in the morning.",
    summary:
      "Alma invites prayerful attention through the day and gratitude on rising. Our evening practice offers a quiet way to notice what you received and what you want to carry forward.",
    action:
      "Before bed, name one help you received today. Make a note to thank the person, or include it in a prayer if that is part of your practice.",
    reflection: "What would you like to remember about today?",
    category: "Gratitude",
    minutes: 3,
    sourceUrl:
      "https://www.churchofjesuschrist.org/study/scriptures/bofm/alma/37?lang=eng&id=p37#p37",
  },
  {
    id: "be-willing-to-learn",
    title: "Be willing to learn",
    source: "book-of-mormon",
    reference: "Ether 12:27",
    plainMeaning:
      "Humility means admitting a limitation without treating it as your whole worth. This passage connects humility and trust in God with receiving grace, or help that is freely given.",
    everydayExample:
      "You are learning a new task at work and do not understand one step. Instead of pretending you know, you ask a colleague to show that step again and take a note.",
    smsText:
      "Book of Mormon - Ether 12:27. Humility admits limits and welcomes help; this passage connects it with God's grace. Unsure about a work task? Ask a trusted colleague to show one step again.",
    summary:
      "This passage connects humility, faith, and divine grace in the face of weakness. Acknowledging what you do not yet know can be a beginning rather than a verdict on your worth.",
    action:
      "Choose one thing you do not yet understand. Ask a trusted person a specific question, then write down the answer or try the step with their guidance.",
    reflection: "What changes when needing help is allowed to be part of learning?",
    category: "Humility",
    minutes: 5,
    sourceUrl:
      "https://www.churchofjesuschrist.org/study/scriptures/bofm/ether/12?lang=eng&id=p27#p27",
  },
  {
    id: "celebrate-someone-else",
    title: "Celebrate someone else",
    source: "book-of-mormon",
    reference: "Moroni 7:45–47",
    plainMeaning:
      "Charity here means Christlike love that is patient, kind, and not driven by envy. One practical expression is appreciating another person's good news without turning it into a comparison.",
    everydayExample:
      "A friend gets an opportunity you had also hoped for. You can acknowledge your own disappointment while sending a sincere message of congratulations about the effort they put in.",
    smsText:
      "Book of Mormon - Moroni 7:45–47. Charity is patient, kind love without envy. A friend gets an opportunity you wanted? Acknowledge your feelings, then offer sincere congratulations without comparison.",
    summary:
      "Mormon describes charity as patient, kind, and free from envy. One ordinary expression of that love is making room to appreciate another person’s good news.",
    action:
      "Congratulate someone on a specific effort or achievement today. Keep the message about them instead of comparing their progress with yours.",
    reflection: "What was it like to give someone else your undivided encouragement?",
    category: "Compassion",
    minutes: 3,
    sourceUrl:
      "https://www.churchofjesuschrist.org/study/scriptures/bofm/moro/7?lang=eng&id=p45-p47#p45",
  },
  {
    id: "make-room-at-the-table",
    title: "Make room at the table",
    source: "book-of-mormon",
    reference: "2 Nephi 26:33",
    plainMeaning:
      "Belonging means treating someone as a person worth welcoming, rather than as an outsider. Nephi describes God's invitation as open to everyone and affirms equal standing before God.",
    everydayExample:
      "A new coworker sits alone while your usual group has lunch. You introduce yourself and offer them a seat, while making it comfortable for them to decline.",
    smsText:
      "Book of Mormon - 2 Nephi 26:33. God's invitation includes everyone. A new coworker is alone at lunch? Introduce yourself and offer a seat, while respecting their choice to join or decline.",
    summary:
      "Nephi describes God’s invitation as open to all and affirms equal standing before God. Our practice asks how an everyday welcome can reflect that dignity.",
    action:
      "Offer one clear invitation to someone who may be left out of an ordinary activity. Introduce yourself or explain what is happening, and respect their choice.",
    reflection: "What makes an invitation feel welcoming rather than pressuring?",
    category: "Belonging",
    minutes: 3,
    sourceUrl:
      "https://www.churchofjesuschrist.org/study/scriptures/bofm/2-ne/26?lang=eng&id=p33#p33",
  },
  {
    id: "give-time-to-what-matters",
    title: "Give time to what matters",
    source: "book-of-mormon",
    reference: "3 Nephi 13:19–21",
    plainMeaning:
      "Jesus teaches people to seek treasure in heaven rather than making possessions the centre of life. Our everyday application is to give attention to a relationship or responsibility we say matters.",
    everydayExample:
      "You have ten free minutes and automatically open a shopping app, though you have been meaning to check on a friend. You close the app and send the message you have been postponing.",
    smsText:
      "Book of Mormon - 3 Nephi 13:19–21. Give attention to what lasts beyond possessions. Opening a shopping app out of habit? Use five minutes instead to check in with someone you care about.",
    summary:
      "Jesus contrasts temporary possessions with enduring treasure and connects treasure with the heart. Our reflection applies that question to the attention we give each day.",
    action:
      "Use five minutes of your next free period for a person or value that matters to you. For example, put your phone aside to listen or send a thoughtful check-in.",
    reflection: "Does the way you use your attention reflect what you value?",
    category: "Stewardship",
    minutes: 5,
    sourceUrl:
      "https://www.churchofjesuschrist.org/study/scriptures/bofm/3-ne/13?lang=eng&id=p19-p21#p19",
  },
];

export function getPractice(id: string): Practice | undefined {
  return practices.find((practice) => practice.id === id);
}
