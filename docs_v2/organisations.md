# Organisations Feature

## Overview
Organisations are officially endorsed partner institutions. They appear on the public page and contribute to domain affiliate weights for resolution voting. Organisations are separate from user affiliations — they are first-class entities with their own founding cells, settings modals, and public profiles.

## Domain Types
Domains are classified into three types:

| Type | Purpose | Example |
|------|---------|---------|
| `knowledge` | Core knowledge domains (16) | Astronomy & Astrophysics, Space Law |
| `experiential` | Planned for future | Fieldwork, Lab Work |
| `affiliate` | Created when organisations join | UAS, SGAC, GSS |

## Data Model

### mock.json `domains`
```json
"uas": {
  "label": "Uganda Astronomical Society",
  "short": "UAS",
  "color": "#C0A0E0",
  "hasCircle": false,
  "type": "affiliate"
}
```

### mock.json `organisations`
```json
{
  "id": "uas",
  "name": "Uganda Astronomical Society",
  "acronym": "UAS",
  "shortname": "Uganda Astro",
  "logo": null,
  "location": "Kampala, Uganda",
  "summary": "Amateur and professional astronomy society...",
  "knowledgeDomains": ["astronomy-astrophysics", "science-communication"],
  "status": "Active",
  "founded": "Apr 2026",
  "foundingCell": null,
  "memberCount": 600,
  "website": null
}
```

### Founding Cell
```json
{
  "id": "cell-30",
  "type": "Founding Cell",
  "entityType": "organisation",
  "title": "Organisation: Senegal Space Agency",
  "participants": 8,
  "status": "Active",
  "domains": ["aerospace-engineering", "remote-sensing"],
  "circles": [],
  "draftResolutions": [
    {
      "id": 1,
      "title": "Founding Declaration — Senegal Space Agency",
      "text": "DECLARE: The Solarian Commons formally affiliates the Senegal Space Agency...",
      "action": "Declaration",
      "implementingCircles": [],
      "domainShares": { "aerospace-engineering": 0.55, "remote-sensing": 0.45 },
      "votesNullified": false,
      "aiDraftMeta": { "draftCount": 1, "maxDrafts": 3, ... },
      "versions": [...]
    }
  ]
}
```

## AI Drafter Flow

1. User enters text: "Affiliate the Senegal Space Agency [ASE]"
2. `extractAcronym(text)` extracts `ASE` from `[ASE]`
3. `generateOrgSettings(text)` runs:
   - Calls `extractAcronym()` for acronym
   - Searches `orgs` for existing org by acronym
   - If not found: creates new org with AI-generated defaults
   - Sets knowledge domains from proposal text
   - Returns `{ acronym, name, domains, summary, location }`
4. AI generates founding resolution text
5. Founding cell created with:
   - `type: "Founding Cell"`, `entityType: "organisation"`
   - Draft resolution with `domainShares` set by AI
6. Cell appears in Cells view and links to Organisations

## Vote Weight Impact
When an organisation joins, its `knowledgeDomains` become affiliate domains. These affect vote weights in resolutions that reference those domains.

**Example:**
- UAS joins with knowledge domains: `astronomy-astrophysics`, `science-communication`
- These become affiliate domains with type `affiliate`
- A resolution about astronomy now has weighted votes from UAS members
- Domain shares are set by AI during founding, not user-editable

## Acronym Auto-linking
- `extractAcronym(text)` — regex `\[([^\]]+)\]` on input text
- `findOrgByAcronym(acronym)` — searches `orgs` array by acronym or shortname
- `autoLinkOrgs(text)` — wraps matched acronyms with clickable spans

## Views & Modals

### Organisations View
- Grid of organisation cards
- Stats sidebar (count, domains, locations)
- Search/filter functionality

### Organisation Settings Modal
- Titlebar: `[×] Organisation Settings`
- Two tabs: Profile, Domains
- Profile tab: name, acronym, short name, location, summary, website
- Domains tab: knowledge domain tags (add/remove)
- Footerbar: `[Submit as Proposal] [Cancel]`

### Organisation Detail Modal
- Titlebar: `[×] Organisation Name`
- Profile card with logo placeholder, name, location, founded date
- Summary text
- Knowledge domain tags
- Affiliated members list
- Footer actions: Settings, Visit Website

## Cells View
Founding cells appear in the Cells grid:
- Type badge: "Founding Cell"
- Title: "Organisation: [Name]"
- Clicking navigates to Organisations view

## Public Page (`organisations.html`)
- Loads organisations from `mock.json` dynamically
- Shows name, domains, location, member count, summary
- CTA: "Affiliate your organisation"

## Domain Map
- New toggle: "Organisations" mode
- Shows edges between affiliate domains and their knowledge domains
- Affiliate nodes appear on the map with their knowledge domain connections
- Affiliate domains added to layout seeds

## Future Enhancements
- Full founding flow with STF verification of org credentials
- Org-to-org affiliations
- Per-org domain weight configuration (currently AI-generated)
- Org admin dashboard
- Member export/import
