![got-a.page - Everyone's got a page](https://raw.githubusercontent.com/got-a-page/.github/main/profile/assets/banner.svg)

<!-- Previous purple badges:
<a href="https://github.com/got-a-page/claim/issues"><img alt="Issues" src="https://img.shields.io/github/issues-raw/got-a-page/claim?label=Issues&style=for-the-badge&color=5b3be8&labelColor=555555"></a> <a href="https://github.com/got-a-page/claim/pulls"><img alt="Pull requests" src="https://img.shields.io/github/issues-pr-raw/got-a-page/claim?label=Pull%20requests&style=for-the-badge&color=5b3be8&labelColor=555555"></a> <a href="https://github.com/got-a-page/claim/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/got-a-page/claim?label=Stars&style=for-the-badge&color=5b3be8&labelColor=555555"></a> <a href="https://github.com/got-a-page/claim/graphs/contributors"><img alt="Contributors" src="https://img.shields.io/github/contributors/got-a-page/claim?label=Contributors&style=for-the-badge&color=5b3be8&labelColor=555555"></a> <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/got-a-page/claim?label=License&style=for-the-badge&color=5b3be8&labelColor=555555"></a>
-->
<a href="https://github.com/got-a-page/claim/issues"><img alt="Issues" src="https://img.shields.io/github/issues-raw/got-a-page/claim?label=Issues&style=for-the-badge&color=e8590c&labelColor=555555"></a> <a href="https://github.com/got-a-page/claim/pulls"><img alt="Pull requests" src="https://img.shields.io/github/issues-pr-raw/got-a-page/claim?label=Pull%20requests&style=for-the-badge&color=e8590c&labelColor=555555"></a> <a href="https://github.com/got-a-page/claim/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/got-a-page/claim?label=Stars&style=for-the-badge&color=e8590c&labelColor=555555"></a> <a href="https://github.com/got-a-page/claim/graphs/contributors"><img alt="Contributors" src="https://img.shields.io/github/contributors/got-a-page/claim?label=Contributors&style=for-the-badge&color=e8590c&labelColor=555555"></a> <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/got-a-page/claim?label=License&style=for-the-badge&color=e8590c&labelColor=555555"></a>

# got-a.page

**Everyone's got a page.** Claim yours - free, forever, no hosting required.

`yourname.got-a.page` is a free subdomain you claim with one small JSON file and
one pull request. Use it for your profile, your product launch, your side
project, your club, your event. If you already have a website, point your name
at it. If you don't, we'll build a lovely page for you on the spot.

## Claim yours in about a minute

1. **Fork this repository** (button, top right).
2. **Add one file**: `pages/yourname.json` - copy a starter below.
3. **Open a pull request.** Validation checks review your file. Follow the
   check results; fork PRs do not get automatic bot comments.
4. **For point mode, connect the domain on your host before merge.** Follow
   [the host setup guide](docs/CONNECT-HOST.md). Instant mode skips this.
5. A maintainer merges. Instant pages go live within minutes. Point-mode
   pages need DNS sync **and** your host's custom-domain setup and HTTPS
   certificate before they work.

Never made a pull request? This repo is a kind place for your first one - the
[step-by-step guide](CONTRIBUTING.md) walks you through every click.

Please consider leaving a star ⭐️ to help support us!

## Two ways to get a page

### Instant - you have no website (we host it for you)

```json
{
  "mode": "instant",
  "owner": { "github": "yourusername" },
  "page": {
    "type": "person",
    "title": "Your Name",
    "tagline": "What you're about, in one line",
    "avatar": "https://github.com/yourusername.png",
    "theme": "sunrise",
    "links": [{ "label": "GitHub", "url": "https://github.com/yourusername" }],
    "sections": [{ "heading": "About", "text": "A few sentences about you." }]
  }
}
```

Pick a theme (`sunrise`, `lagoon`, `forest`, `plum`, `slate`, `ember`), add your
links, done. We render a fast, accessible page at `yourname.got-a.page` -
light and dark mode included.

### Point - you already host a site somewhere

```json
{
  "mode": "point",
  "owner": { "github": "yourusername" },
  "purpose": "My portfolio",
  "records": { "CNAME": "yourusername.github.io" }
}
```

Works with GitHub Pages, Vercel, Netlify, Cloudflare Pages - anywhere that
gives you a hostname or IP. `CNAME`, `A`, `AAAA` and `TXT` records supported.

## After your PR merges

**Instant mode:** we host your page; no CNAME file or hosting setup is needed.
Your page appears within a few minutes of merge. Until the index republishes
and caches refresh, `yourname.got-a.page` may still show the "unclaimed"
page - that's normal, check back shortly.

**Point mode:** DNS alone is not enough. You must also add
`yourname.got-a.page` to your own hosting account, ideally before merge.
For GitHub Pages, this means **your website repo > Settings > Pages > Custom
domain**. Branch publishing creates a `CNAME` file in that site's publishing
source; custom Actions publishing uses the setting without needing that file.
Do not add a `CNAME` file to this claim repo.

See the [host setup guide](docs/CONNECT-HOST.md) for GitHub Pages, Vercel,
Netlify and Cloudflare Pages. After merge, wait for DNS sync and your host's
HTTPS certificate, then test `https://yourname.got-a.page`. Certificate
issuance can take a while; GitHub says Enforce HTTPS can take up to 24 hours.

### What to expect, step by step

1. **Right after merge:** your claim file is in the repo. Automated runs
   publish the index and sync DNS - you can watch them in the
   [Actions tab](https://github.com/got-a-page/claim/actions).
2. **Instant mode:** live within a few minutes, no further setup.
3. **Point mode:** DNS publishes first, then your host verifies the domain
   and issues its HTTPS certificate. Browsers show a privacy/certificate
   error for your address until the certificate exists. That window is
   expected - minutes to hours, occasionally longer.
4. Once the certificate is issued, turn on **Enforce HTTPS** at your host
   (GitHub Pages: Settings > Pages) and share your page.

### "Is it broken?" - troubleshooting

- **A browser certificate or privacy error right after merge (point mode):**
  normal - the host's certificate is not ready yet. Wait, then enable
  Enforce HTTPS when your host offers it.
- **Your old `yourname.github.io` address shows the same error:** expected.
  GitHub Pages redirects the old `github.io` address to your custom domain as
  soon as you save it, so both addresses show the certificate error during
  the waiting window, and both recover when the certificate is issued.
- **Your address says "unclaimed" (instant mode):** the index has not
  republished yet. Give it a few minutes after merge and hard-refresh.
- **The page loads but looks unstyled:** your site is probably loading its
  CSS or JS from the old address or over `http://`. Use relative asset URLs
  or update your static site generator's URL/base-path setting for the new
  domain.
- **Still stuck after a day?** Open an issue with your page name and what
  you see - real humans read them.

## A few kind rules

- Names are 2-40 characters, lowercase letters, numbers and hyphens.
- One GitHub account, up to **2 pages** while we're young.
- Your page is public. Everything in this repo is public.
- Be good: no phishing, scams, malware, impersonation, illegal or adult
  content. See [TERMS.md](TERMS.md) and [ABUSE.md](ABUSE.md).
- Some names are [reserved](reserved.json) (brands, service addresses, and
  words that would make this place less welcoming).

## What's where

| Path | What it does |
| --- | --- |
| `pages/` | One JSON file per claimed page |
| `schema/` | The shape every file is checked against |
| `scripts/` | Validation, index build and DNS sync (TypeScript) |
| `reserved.json` | Names nobody can claim |
| `config.json` | Limits (pages per account, DNS record budget, flags) |

## The plumbing (for the curious)

Instant pages all ride **one wildcard DNS record** into a small Cloudflare
Worker that renders them, so a thousand pages cost one DNS entry. Pointed
pages get their own records, synced from this repo by a diff-based job that
only ever touches records it created. The DNS layer is provider-agnostic, so
moving providers later is an adapter, not a rewrite.

## License

MIT - see [LICENSE](LICENSE).
