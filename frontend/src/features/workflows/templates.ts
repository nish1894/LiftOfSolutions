import type { WorkflowStep, WorkflowTrigger } from "@/shared/types.ts";

/* The workflows a team can start from. Only ones the platform's steps can express; each can be changed after. */

export const CATEGORIES = [
  { id: "all", label: "All templates" },
  { id: "greetings", label: "Greetings and away" },
  { id: "routing", label: "Routing" },
  { id: "ai", label: "AI agents" },
  { id: "contacts", label: "Contact details" },
  { id: "closing", label: "After closing" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export interface WorkflowTemplate {
  id: string;
  category: Exclude<CategoryId, "all">;
  title: string;
  /** Shown on the template card. */
  summary: string;
  /** Shown on the template's page. */
  description: string;
  benefits: string[];
  howItWorks: string[];
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "welcome",
    category: "greetings",
    title: "Welcome message",
    summary: "Greets every new conversation, and welcomes returning contacts back.",
    description:
      "Reply the moment a contact gets in touch, so nobody waits in silence while your team gets to them.",
    benefits: [
      "Every contact hears back straight away, even when the team is busy.",
      "Returning contacts get a welcome back instead of a first-time greeting.",
    ],
    howItWorks: [
      "Starts when a contact opens a new conversation.",
      "Checks whether the contact has talked to you before.",
      "Sends a welcome back, or a first welcome.",
    ],
    trigger: "conversation_opened",
    steps: [
      {
        id: "s1",
        type: "branch",
        condition: "returning_contact",
        yes: [{ id: "s2", type: "send_message", text: "Welcome back! How can we help today?" }],
        no: [
          {
            id: "s3",
            type: "send_message",
            text: "Hi, thanks for getting in touch. How can we help?",
          },
        ],
      },
    ],
  },
  {
    id: "away",
    category: "greetings",
    title: "Away message",
    summary: "Tells contacts when you're closed, and when to expect a reply.",
    description:
      "Set expectations outside business hours, so contacts know their message arrived and when you'll answer.",
    benefits: [
      "Contacts know their message reached you.",
      "Fewer follow-up messages asking whether anyone is there.",
    ],
    howItWorks: [
      "Starts when a contact opens a new conversation.",
      "Checks whether it's inside your business hours.",
      "Outside them, sends your away message.",
    ],
    trigger: "conversation_opened",
    steps: [
      {
        id: "s1",
        type: "branch",
        condition: "business_hours",
        yes: [],
        no: [
          {
            id: "s2",
            type: "send_message",
            text: "Thanks for your message. We're closed right now, and we'll reply as soon as we're back.",
          },
        ],
      },
    ],
  },
  {
    id: "round-robin",
    category: "routing",
    title: "Assign in turn",
    summary: "Shares new conversations evenly across the team.",
    description:
      "Give each new conversation to the next teammate in turn, so the work is shared and nothing sits unassigned.",
    benefits: [
      "Conversations are shared evenly without anyone handing them out.",
      "Contacts are told a person is on the way.",
    ],
    howItWorks: [
      "Starts when a contact opens a new conversation.",
      "Assigns it to the next teammate who can reply in this project.",
      "Tells the contact a teammate will be with them shortly.",
    ],
    trigger: "conversation_opened",
    steps: [
      { id: "s1", type: "assign", to: "round_robin" },
      {
        id: "s2",
        type: "send_message",
        text: "Thanks for reaching out. A teammate will be with you shortly.",
      },
    ],
  },
  {
    id: "ai-first",
    category: "ai",
    title: "AI agent first",
    summary: "An AI agent answers first, and passes the conversation to a person when needed.",
    description:
      "Let one of your agents answer common questions from your documents, and bring in a teammate when the contact asks for one or the agent can't help.",
    benefits: [
      "Common questions are answered at any hour.",
      "Contacts can still reach a person.",
      "Teammates get only the conversations that need them.",
    ],
    howItWorks: [
      "Starts when a contact opens a new conversation.",
      "Your AI agent answers until it hands the conversation over.",
      "Assigns it to the next teammate, and tells the contact.",
    ],
    trigger: "conversation_opened",
    steps: [
      { id: "s1", type: "hand_to_agent" },
      { id: "s2", type: "assign", to: "round_robin" },
      {
        id: "s3",
        type: "send_message",
        text: "I've passed you to a teammate, who'll reply here.",
      },
    ],
  },
  {
    id: "ask-email",
    category: "contacts",
    title: "Ask for an email",
    summary: "Asks new contacts for their email, and saves it on the contact.",
    description:
      "Collect an email address early, so your team can follow up even after the chat ends.",
    benefits: [
      "Contacts' emails are saved without a teammate asking.",
      "Contacts you already have an email for aren't asked again.",
    ],
    howItWorks: [
      "Starts when a contact opens a new conversation.",
      "Checks whether you already have the contact's email.",
      "If not, asks for it and saves the answer on the contact.",
    ],
    trigger: "conversation_opened",
    steps: [
      {
        id: "s1",
        type: "branch",
        condition: "has_email",
        yes: [],
        no: [
          {
            id: "s2",
            type: "ask",
            text: "What's the best email to reach you at?",
            save_to: "email",
          },
        ],
      },
    ],
  },
  {
    id: "unassign",
    category: "closing",
    title: "Unassign after close",
    summary: "Frees closed conversations, so they reach the next available teammate.",
    description:
      "When a conversation closes, take it off the teammate who had it. If the contact writes again, it's routed afresh.",
    benefits: [
      "Teammates' lists only show open work.",
      "A contact who comes back isn't stuck with someone who's away.",
    ],
    howItWorks: [
      "Starts when a conversation is resolved or closed.",
      "Unassigns it.",
      "Leaves a note for the team.",
    ],
    trigger: "conversation_closed",
    steps: [
      { id: "s1", type: "assign", to: "nobody" },
      { id: "s2", type: "add_note", text: "Unassigned by the workflow after closing." },
    ],
  },
  {
    id: "thanks",
    category: "closing",
    title: "Thank-you after close",
    summary: "Thanks the contact when their conversation is closed.",
    description:
      "End every conversation on a good note, and let the contact know they can write again any time.",
    benefits: [
      "Every contact gets a consistent goodbye.",
      "Contacts know how to reach you next time.",
    ],
    howItWorks: ["Starts when a conversation is resolved or closed.", "Sends a thank-you message."],
    trigger: "conversation_closed",
    steps: [
      {
        id: "s1",
        type: "send_message",
        text: "Thanks for talking with us. Message us here any time.",
      },
    ],
  },
];
