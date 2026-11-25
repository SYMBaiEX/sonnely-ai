# Compute market

The marketplace behind a run: providers list what they can host — a region,
a GPU or TEE class, an hourly price and a capacity — a claim allocates one
unit of a provider's capacity to an instance, and a release restores it.

## Domain

### A provider offer names region, class, price and capacity

An offer is one provider's stock in one region and one GPU or TEE class at
an hourly price; `capacity` is how many instances it can host at once and
`claimed` is how many of those units are allocated now.

```quint
type Offer = {
  provider: str,
  region: str,
  teeClass: str,
  hourlyPrice: int,
  capacity: int,
  claimed: int,
}

type Market = { offers: List[Offer] }
```

### The market opens with no offers

```quint
pure val initial: Market = { offers: List() }
```

```quint
pure val providerValues = Set("phala", "boat")
pure val regionValues = Set("us-east", "eu-west")
pure val teeClassValues = Set("tdx.small", "boat.small")
pure val hourlyPriceValues = Set(60780, 18000)
pure val capacityValues = Set(1, 2)
```

## Story: Allocate provider capacity

> As the platform, I want providers to list capacity and instances to claim
> and release it, so that no provider is oversubscribed and freed capacity
> can be used again.

### An offer's key is its provider, region and class together

```quint
pure def sameOfferKey(o: Offer, provider: str, region: str, teeClass: str): bool =
  o.provider == provider and o.region == region and o.teeClass == teeClass
```

### A provider lists an offer once per region and class

```quint
pure def canList(m: Market, provider: str, region: str, teeClass: str, hourlyPrice: int, capacity: int): bool =
  provider != "" and region != "" and teeClass != "" and
  hourlyPrice >= 0 and capacity > 0 and
  not(m.offers.some(o => sameOfferKey(o, provider, region, teeClass)))

pure def list(m: Market, provider: str, region: str, teeClass: str, hourlyPrice: int, capacity: int): Market =
  if (not(canList(m, provider, region, teeClass, hourlyPrice, capacity))) m
  else { ...m, offers: m.offers.append({ provider: provider, region: region, teeClass: teeClass, hourlyPrice: hourlyPrice, capacity: capacity, claimed: 0 }) }
```

### A claim allocates one unit of an offer's free capacity

```quint
pure def canClaim(m: Market, provider: str, region: str, teeClass: str): bool =
  m.offers.some(o => sameOfferKey(o, provider, region, teeClass) and o.claimed < o.capacity)

pure def claim(m: Market, provider: str, region: str, teeClass: str): Market =
  if (not(canClaim(m, provider, region, teeClass))) m
  else { ...m, offers: m.offers.listMap(o =>
    if (sameOfferKey(o, provider, region, teeClass)) { ...o, claimed: o.claimed + 1 } else o) }
```

### A release restores one claimed unit

```quint
pure def canRelease(m: Market, provider: str, region: str, teeClass: str): bool =
  m.offers.some(o => sameOfferKey(o, provider, region, teeClass) and o.claimed > 0)

pure def release(m: Market, provider: str, region: str, teeClass: str): Market =
  if (not(canRelease(m, provider, region, teeClass))) m
  else { ...m, offers: m.offers.listMap(o =>
    if (sameOfferKey(o, provider, region, teeClass)) { ...o, claimed: o.claimed - 1 } else o) }
```

### Claimed capacity is always inside the offer's capacity

Claims decrement free capacity and releases restore it; the sum an offer
has allocated never leaves `[0, capacity]`.

```quint
pure def alwaysClaimedWithinCapacity(m: Market): bool =
  m.offers.every(o => o.claimed >= 0 and o.claimed <= o.capacity)
```

### Offers are listed once

```quint
pure def alwaysOffersAreUnique(m: Market): bool =
  m.offers.every(o => m.offers.every(p =>
    not(sameOfferKey(o, p.provider, p.region, p.teeClass)) or o == p))
```

### A step shifts an offer's allocation by at most one unit

A claim adds one to its offer, a release removes one, and a listing adds
a fresh offer claimed nothing.

```quint
pure def stepClaimsMoveByOne(before: Market, after: Market): bool =
  before.offers.every(rb => after.offers.every(ra =>
    not(sameOfferKey(ra, rb.provider, rb.region, rb.teeClass)) or
    ((ra.claimed - rb.claimed <= 1) and (rb.claimed - ra.claimed <= 1)))) and
  after.offers.every(ra => before.offers.every(rb =>
    not(sameOfferKey(ra, rb.provider, rb.region, rb.teeClass)) or
    ((ra.claimed - rb.claimed <= 1) and (rb.claimed - ra.claimed <= 1))))
```

### A claim followed by a release returns the offer to what it was

```quint
pure def lawClaimReleaseRestores(m: Market, provider: str, region: str, teeClass: str): bool =
  not(canClaim(m, provider, region, teeClass) and alwaysClaimedWithinCapacity(m)) or
    release(claim(m, provider, region, teeClass), provider, region, teeClass) == m
```

### Capacity can be claimed and an offer can fill

```quint
pure def sometimesClaimed(m: Market): bool = m.offers.some(o => o.claimed > 0)

pure def sometimesFull(m: Market): bool = m.offers.some(o => o.capacity > 0 and o.claimed == o.capacity)

pure val eval_witness_sometimesFull = (
  ("list", "phala", "us-east", "tdx.small", 60780, 1),
  ("claim", "phala", "us-east", "tdx.small"))
```
