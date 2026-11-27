# Navigation

Where a visitor is in the application and where they can go. The site, the
docs and the console are pages of one application; the browser's address bar
and back button speak for the same state the machine keeps.

## Domain

### Pages and console sections

Every page a visitor can be on. A console page is one of its sections; the
admin section can name an admin area. `Journal` is the journal's index and
`Post` one of its articles. `Model` carries the provider and the model id,
`Post` and `Doc` carry their slugs, `Verify` may carry the receipt it was
opened to inspect. `Contact` is the baseline contact page; `ContactOne`,
`ContactTwo`, `ContactThree` and `ContactFour` are working redesign concepts.

```quint
type Section =
  | Chat | Catalog | Keys | Usage | Logs | Batch
  | Billing | Teams | Referrals | Support | Settings | Admin

type Page =
  | Home
  | Inference
  | Models | Pricing | Model({ provider: str, model: str })
  | Status | Journal | Post({ slug: str }) | Privacy | Terms | Verify | Contact
  | ContactOne | ContactTwo | ContactThree | ContactFour
  | Docs | Doc({ slug: str })
  | Console({ section: Section, area: str })
  | Unknown

type Nav = { page: Page, back: List[Page] }
```

### Navigation starts on the home page with nowhere to go back to

```quint
pure val initial: Nav = { page: Home, back: List() }
```

```quint
pure val pageValues = Set(
  Home, Inference, Models, Pricing, Status, Journal, Privacy, Terms, Verify, Contact,
  ContactOne, ContactTwo, ContactThree, ContactFour, Docs,
  Model({ provider: "deepseek-ai", model: "DeepSeek-V4.1" }),
  Post({ slug: "hello-world" }), Doc({ slug: "quickstart" }),
  Console({ section: Chat, area: "" }), Console({ section: Admin, area: "crm" }),
  Unknown,
)
```

## Story: Move around

> As a visitor, I want to open pages and find my way back, so that I can read
> the site, the docs and my console without getting lost.

### Any page can be opened

Opening a page remembers the page it left, so going back is possible. The
address bar, a link and the console's own navigation all open pages.

```quint
pure def open(n: Nav, page: Page): Nav = { page: page, back: List(n.page).concat(n.back) }
```

### Going back is possible only after opening a page

```quint
pure def canBack(n: Nav): bool = n.back.length() > 0

pure def back(n: Nav): Nav =
  if (n.back.length() > 0) { page: n.back.head(), back: n.back.tail() } else n
```

### Opening a page leaves it showing

```quint
pure def stepOpensThePage(before: Nav, via: str, after: Nav): bool =
  via != "open" or (after.back.length() > 0 and after.back.head() == before.page)
```

### Opening then going back returns where it started

```quint
pure def lawOpenThenBackReturns(n: Nav, page: Page): bool =
  back(open(n, page)) == n
```

### Going back twice needs two pages opened

```quint
pure def sometimesDeeperThanOne(n: Nav): bool = n.back.length() >= 2
```
