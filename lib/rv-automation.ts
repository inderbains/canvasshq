/** RealVolt CRM Automation v1. Only plain-text draft generation, no delivery. */
export type AutomationAction = 'create_task' | 'add_note' | 'draft_email' | 'wait';
export type ContactPreview = {
  full_name: string;
  contact_type?: string | null;
  preferred_area?: string | null;
  stage?: string | null;
};

export const actionLabels: Record<AutomationAction,string> = {
  create_task:'Create CRM task', add_note:'Add contact note', draft_email:'Prepare email draft', wait:'Wait / delay',
};

/** Exact supported tokens. No JavaScript evaluation, HTML or remote fetches. */
export function fillTemplate(template: string, contact: ContactPreview): string {
  const name = contact.full_name?.trim() || 'there';
  const values: Record<string,string> = {
    '{{first_name}}': name.split(/\s+/)[0] || 'there',
    '{{full_name}}': name,
    '{{contact_type}}': contact.contact_type || 'Client',
    '{{preferred_area}}': contact.preferred_area || 'your preferred area',
    '{{stage}}': contact.stage || 'New',
  };
  return String(template || '').replace(/\{\{(?:first_name|full_name|contact_type|preferred_area|stage)\}\}/g, (token) => values[token] ?? token);
}

export const defaultSteps = [
  {action_type:'draft_email' as const,delay_minutes:0,config:{subject:'Thank you for reaching out, {{first_name}}',body:'Hi {{first_name}},\n\nThank you for your inquiry. I would be happy to learn more about what you are looking for and answer any questions. What is a convenient time to connect?\n\nBest regards'}},
  {action_type:'create_task' as const,delay_minutes:1440,config:{title:'Follow up with {{full_name}}',priority:'High'}},
  {action_type:'create_task' as const,delay_minutes:4320,config:{title:'Check in with {{first_name}} (if still interested)',priority:'Normal'}},
];
