# Security notes

CanvassHQ is designed as a multi-tenant application. Treat every organization as a separate security boundary.

- Never expose the Supabase service-role key to browser code.
- Keep Row Level Security enabled on tenant tables.
- Owners/Admins can invite users; field roles cannot grant themselves broader access.
- Canvasser address reads are limited to doors directly assigned to that user in the starter schema.
- Validate organization, campaign, district, address and assignee relationships on server routes before using the service-role client.
- Use HTTPS in production and configure the exact production Auth callback URL.
- Establish data retention, deletion, access review and breach-response procedures before commercial use.
- Review applicable privacy, election, anti-spam and campaign-finance requirements for every jurisdiction where a customer uses the product.
