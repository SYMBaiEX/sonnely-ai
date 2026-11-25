// spec/app/compute/market.md, "Story: Allocate provider capacity"

// spec/app/compute/market.md, "Story: Allocate provider capacity": a run's element in a mapped list is the image of an element of the list.
lemma MappedMember(xs: seq<Offer>, g: Offer -> Offer, o: Offer)
  ensures o in (seq(|xs|, i requires 0 <= i < |xs| => g(xs[i])))
        ==> (exists x :: x in xs && g(x) == o)
{
  var ys := seq(|xs|, i requires 0 <= i < |xs| => g(xs[i]));
  if o in ys {
    var i :| 0 <= i < |ys| && ys[i] == o;
    assert xs[i] in xs && g(xs[i]) == o;
  }
}

// spec/app/compute/market.md, "A claim never exceeds its offer's capacity": a rule that no offer breaks holds at each offer.
lemma OfferFacts(m: Market, o: Offer)
  requires alwaysClaimedWithinCapacity(m) && o in m.offers
  ensures 0 <= o.claimed && o.claimed <= o.capacity
{
  if !((o.claimed >= 0) && (o.claimed <= o.capacity)) {
    assert exists x :: x in m.offers && !((x.claimed >= 0) && (x.claimed <= x.capacity));
  }
}

// spec/app/compute/market.md, "A provider lists an offer once per region and class": two offers with one key are one offer.
lemma SameKeySameOffer(m: Market, x: Offer, w: Offer)
  requires alwaysOffersAreUnique(m) && x in m.offers && w in m.offers &&
           sameOfferKey(x, w.provider, w.region, w.teeClass)
  ensures x == w
{
  if x != w {
    assert !((!(sameOfferKey(x, w.provider, w.region, w.teeClass))) || (x == w));
    assert exists p :: p in m.offers && !((!(sameOfferKey(x, p.provider, p.region, p.teeClass))) || (x == p));
    assert !(!(exists p :: p in m.offers && !((!(sameOfferKey(x, p.provider, p.region, p.teeClass))) || (x == p))));
  }
}

// spec/app/compute/market.md, "A provider lists an offer once per region and class": what no key has, no offer can witness.
lemma NoKeyOffer(m: Market, provider: string, region: string, teeClass: string, o: Offer)
  requires !(exists x :: x in m.offers && sameOfferKey(x, provider, region, teeClass)) && o in m.offers
  ensures !(sameOfferKey(o, provider, region, teeClass))
{
  if sameOfferKey(o, provider, region, teeClass) {
    assert exists x :: x in m.offers && sameOfferKey(x, provider, region, teeClass);
  }
}

// spec/app/compute/market.md, "A provider lists an offer once per region and class"
lemma list_ensures(m: Market, provider: string, region: string, teeClass: string, hourlyPrice: int, capacity: int)
  ensures (inv(m) ==> canList(m, provider, region, teeClass, hourlyPrice, capacity) ==> alwaysClaimedWithinCapacity(list(m, provider, region, teeClass, hourlyPrice, capacity)))
  ensures (inv(m) ==> canList(m, provider, region, teeClass, hourlyPrice, capacity) ==> alwaysOffersAreUnique(list(m, provider, region, teeClass, hourlyPrice, capacity)))
  ensures (inv(m) ==> canList(m, provider, region, teeClass, hourlyPrice, capacity) ==> stepClaimsMoveByOne(m, list(m, provider, region, teeClass, hourlyPrice, capacity)))
{
  if inv(m) && canList(m, provider, region, teeClass, hourlyPrice, capacity) {
    var after := list(m, provider, region, teeClass, hourlyPrice, capacity);
    var added := Offer(provider, region, teeClass, hourlyPrice, capacity, 0);
    assert after.offers == m.offers + [added];
    assert alwaysOffersAreUnique(m);
    assert alwaysClaimedWithinCapacity(m);
    forall o | o in after.offers
      ensures 0 <= o.claimed && o.claimed <= o.capacity
    {
      if o == added {
      } else {
        assert o in m.offers;
        OfferFacts(m, o);
      }
    }
    assert alwaysClaimedWithinCapacity(after);

    forall o | o in after.offers
      ensures !(exists p :: p in after.offers && !((!(sameOfferKey(o, p.provider, p.region, p.teeClass))) || (o == p)))
    {
      forall p | p in after.offers
        ensures (!(sameOfferKey(o, p.provider, p.region, p.teeClass))) || (o == p)
      {
        if sameOfferKey(o, p.provider, p.region, p.teeClass) {
          if o == added {
            if p == added {
            } else {
              assert p in m.offers;
              assert sameOfferKey(p, provider, region, teeClass);
              assert exists x :: x in m.offers && sameOfferKey(x, provider, region, teeClass);
              assert false;
            }
          } else if p == added {
            assert o in m.offers;
            assert sameOfferKey(o, provider, region, teeClass);
            assert exists x :: x in m.offers && sameOfferKey(x, provider, region, teeClass);
            assert false;
          } else {
            assert o in m.offers && p in m.offers;
            SameKeySameOffer(m, o, p);
          }
        }
      }
    }
    assert alwaysOffersAreUnique(after);

    forall o | o in m.offers
      ensures !(exists n :: n in after.offers && !((!(sameOfferKey(n, o.provider, o.region, o.teeClass))) || (((n.claimed - o.claimed) <= 1) && ((o.claimed - n.claimed) <= 1))))
    {
      forall n | n in after.offers
        ensures (!(sameOfferKey(n, o.provider, o.region, o.teeClass))) || (((n.claimed - o.claimed) <= 1) && ((o.claimed - n.claimed) <= 1))
      {
        if sameOfferKey(n, o.provider, o.region, o.teeClass) {
          if n == added {
            assert sameOfferKey(o, provider, region, teeClass);
            assert exists x :: x in m.offers && sameOfferKey(x, provider, region, teeClass);
            assert false;
          } else {
            assert n in m.offers;
            assert sameOfferKey(o, n.provider, n.region, n.teeClass);
            SameKeySameOffer(m, o, n);
          }
        }
      }
    }
    forall n | n in after.offers
      ensures !(exists o :: o in m.offers && !((!(sameOfferKey(n, o.provider, o.region, o.teeClass))) || (((n.claimed - o.claimed) <= 1) && ((o.claimed - n.claimed) <= 1))))
    {
      forall o | o in m.offers
        ensures (!(sameOfferKey(n, o.provider, o.region, o.teeClass))) || (((n.claimed - o.claimed) <= 1) && ((o.claimed - n.claimed) <= 1))
      {
        if sameOfferKey(n, o.provider, o.region, o.teeClass) {
          if n == added {
            assert sameOfferKey(o, provider, region, teeClass);
            assert exists x :: x in m.offers && sameOfferKey(x, provider, region, teeClass);
            assert false;
          } else {
            assert n in m.offers;
            assert sameOfferKey(o, n.provider, n.region, n.teeClass);
            SameKeySameOffer(m, o, n);
          }
        }
      }
    }
    assert stepClaimsMoveByOne(m, after);
  }
}

// spec/app/compute/market.md, "A claim allocates one unit of an offer's free capacity"
lemma claim_ensures(m: Market, provider: string, region: string, teeClass: string)
  ensures (inv(m) ==> canClaim(m, provider, region, teeClass) ==> alwaysClaimedWithinCapacity(claim(m, provider, region, teeClass)))
  ensures (inv(m) ==> canClaim(m, provider, region, teeClass) ==> alwaysOffersAreUnique(claim(m, provider, region, teeClass)))
  ensures (inv(m) ==> canClaim(m, provider, region, teeClass) ==> stepClaimsMoveByOne(m, claim(m, provider, region, teeClass)))
{
  if inv(m) && canClaim(m, provider, region, teeClass) {
    var after := claim(m, provider, region, teeClass);
    var g := (o: Offer) => (if sameOfferKey(o, provider, region, teeClass) then o.(claimed := (o.claimed + 1)) else o);
    var mapped := seq(|m.offers|, i requires 0 <= i < |m.offers| => g(m.offers[i]));
    assert after.offers == mapped;
    var w :| w in m.offers && (sameOfferKey(w, provider, region, teeClass) && (w.claimed < w.capacity));
    assert alwaysOffersAreUnique(m);
    assert alwaysClaimedWithinCapacity(m);

    forall o | o in after.offers
      ensures 0 <= o.claimed && o.claimed <= o.capacity
    {
      var i :| 0 <= i < |mapped| && mapped[i] == o;
      var x := m.offers[i];
      assert x in m.offers && g(x) == o;
      OfferFacts(m, x);
      if sameOfferKey(x, provider, region, teeClass) {
        assert sameOfferKey(x, w.provider, w.region, w.teeClass);
        SameKeySameOffer(m, x, w);
        assert o == w.(claimed := w.claimed + 1);
      }
    }
    assert alwaysClaimedWithinCapacity(after);

    forall o | o in after.offers
      ensures !(exists p :: p in after.offers && !((!(sameOfferKey(o, p.provider, p.region, p.teeClass))) || (o == p)))
    {
      forall p | p in after.offers
        ensures (!(sameOfferKey(o, p.provider, p.region, p.teeClass))) || (o == p)
      {
        if sameOfferKey(o, p.provider, p.region, p.teeClass) {
          var i :| 0 <= i < |mapped| && mapped[i] == o;
          var j :| 0 <= j < |mapped| && mapped[j] == p;
          var x := m.offers[i];
          var y := m.offers[j];
          assert x in m.offers && y in m.offers && g(x) == o && g(y) == p;
          assert sameOfferKey(x, y.provider, y.region, y.teeClass);
          SameKeySameOffer(m, x, y);
        }
      }
    }
    assert alwaysOffersAreUnique(after);

    forall o | o in m.offers
      ensures !(exists n :: n in after.offers && !((!(sameOfferKey(n, o.provider, o.region, o.teeClass))) || (((n.claimed - o.claimed) <= 1) && ((o.claimed - n.claimed) <= 1))))
    {
      forall n | n in after.offers
        ensures (!(sameOfferKey(n, o.provider, o.region, o.teeClass))) || (((n.claimed - o.claimed) <= 1) && ((o.claimed - n.claimed) <= 1))
      {
        if sameOfferKey(n, o.provider, o.region, o.teeClass) {
          var i :| 0 <= i < |mapped| && mapped[i] == n;
          var x := m.offers[i];
          assert x in m.offers && g(x) == n;
          assert sameOfferKey(x, o.provider, o.region, o.teeClass);
          SameKeySameOffer(m, o, x);
          assert o == x && n == g(o);
        }
      }
    }
    forall n | n in after.offers
      ensures !(exists o :: o in m.offers && !((!(sameOfferKey(n, o.provider, o.region, o.teeClass))) || (((n.claimed - o.claimed) <= 1) && ((o.claimed - n.claimed) <= 1))))
    {
      forall o | o in m.offers
        ensures (!(sameOfferKey(n, o.provider, o.region, o.teeClass))) || (((n.claimed - o.claimed) <= 1) && ((o.claimed - n.claimed) <= 1))
      {
        if sameOfferKey(n, o.provider, o.region, o.teeClass) {
          var i :| 0 <= i < |mapped| && mapped[i] == n;
          var x := m.offers[i];
          assert x in m.offers && g(x) == n;
          assert sameOfferKey(x, o.provider, o.region, o.teeClass);
          SameKeySameOffer(m, o, x);
          assert o == x && n == g(o);
        }
      }
    }
    assert stepClaimsMoveByOne(m, after);
  }
}

// spec/app/compute/market.md, "A release restores one claimed unit"
lemma release_ensures(m: Market, provider: string, region: string, teeClass: string)
  ensures (inv(m) ==> canRelease(m, provider, region, teeClass) ==> alwaysClaimedWithinCapacity(release(m, provider, region, teeClass)))
  ensures (inv(m) ==> canRelease(m, provider, region, teeClass) ==> alwaysOffersAreUnique(release(m, provider, region, teeClass)))
  ensures (inv(m) ==> canRelease(m, provider, region, teeClass) ==> stepClaimsMoveByOne(m, release(m, provider, region, teeClass)))
{
  if inv(m) && canRelease(m, provider, region, teeClass) {
    var after := release(m, provider, region, teeClass);
    var g := (o: Offer) => (if sameOfferKey(o, provider, region, teeClass) then o.(claimed := (o.claimed - 1)) else o);
    var mapped := seq(|m.offers|, i requires 0 <= i < |m.offers| => g(m.offers[i]));
    assert after.offers == mapped;
    var w :| w in m.offers && (sameOfferKey(w, provider, region, teeClass) && (w.claimed > 0));
    assert alwaysOffersAreUnique(m);
    assert alwaysClaimedWithinCapacity(m);

    forall o | o in after.offers
      ensures 0 <= o.claimed && o.claimed <= o.capacity
    {
      var i :| 0 <= i < |mapped| && mapped[i] == o;
      var x := m.offers[i];
      assert x in m.offers && g(x) == o;
      OfferFacts(m, x);
      if sameOfferKey(x, provider, region, teeClass) {
        assert sameOfferKey(x, w.provider, w.region, w.teeClass);
        SameKeySameOffer(m, x, w);
        assert o == w.(claimed := w.claimed - 1);
      }
    }
    assert alwaysClaimedWithinCapacity(after);

    forall o | o in after.offers
      ensures !(exists p :: p in after.offers && !((!(sameOfferKey(o, p.provider, p.region, p.teeClass))) || (o == p)))
    {
      forall p | p in after.offers
        ensures (!(sameOfferKey(o, p.provider, p.region, p.teeClass))) || (o == p)
      {
        if sameOfferKey(o, p.provider, p.region, p.teeClass) {
          var i :| 0 <= i < |mapped| && mapped[i] == o;
          var j :| 0 <= j < |mapped| && mapped[j] == p;
          var x := m.offers[i];
          var y := m.offers[j];
          assert x in m.offers && y in m.offers && g(x) == o && g(y) == p;
          assert sameOfferKey(x, y.provider, y.region, y.teeClass);
          SameKeySameOffer(m, x, y);
        }
      }
    }
    assert alwaysOffersAreUnique(after);

    forall o | o in m.offers
      ensures !(exists n :: n in after.offers && !((!(sameOfferKey(n, o.provider, o.region, o.teeClass))) || (((n.claimed - o.claimed) <= 1) && ((o.claimed - n.claimed) <= 1))))
    {
      forall n | n in after.offers
        ensures (!(sameOfferKey(n, o.provider, o.region, o.teeClass))) || (((n.claimed - o.claimed) <= 1) && ((o.claimed - n.claimed) <= 1))
      {
        if sameOfferKey(n, o.provider, o.region, o.teeClass) {
          var i :| 0 <= i < |mapped| && mapped[i] == n;
          var x := m.offers[i];
          assert x in m.offers && g(x) == n;
          assert sameOfferKey(x, o.provider, o.region, o.teeClass);
          SameKeySameOffer(m, o, x);
          assert o == x && n == g(o);
        }
      }
    }
    forall n | n in after.offers
      ensures !(exists o :: o in m.offers && !((!(sameOfferKey(n, o.provider, o.region, o.teeClass))) || (((n.claimed - o.claimed) <= 1) && ((o.claimed - n.claimed) <= 1))))
    {
      forall o | o in m.offers
        ensures (!(sameOfferKey(n, o.provider, o.region, o.teeClass))) || (((n.claimed - o.claimed) <= 1) && ((o.claimed - n.claimed) <= 1))
      {
        if sameOfferKey(n, o.provider, o.region, o.teeClass) {
          var i :| 0 <= i < |mapped| && mapped[i] == n;
          var x := m.offers[i];
          assert x in m.offers && g(x) == n;
          assert sameOfferKey(x, o.provider, o.region, o.teeClass);
          SameKeySameOffer(m, o, x);
          assert o == x && n == g(o);
        }
      }
    }
    assert stepClaimsMoveByOne(m, after);
  }
}

// spec/app/compute/market.md, "A claim followed by a release returns the offer to what it was"
lemma lawClaimReleaseRestores_ensures(m: Market, provider: string, region: string, teeClass: string)
  ensures (lawClaimReleaseRestores(m, provider, region, teeClass) == true)
{
  if canClaim(m, provider, region, teeClass) && alwaysClaimedWithinCapacity(m) {
    var mid := claim(m, provider, region, teeClass);
    var end := release(mid, provider, region, teeClass);
    var k := (o: Offer) => (((o.provider == provider) && (o.region == region)) && (o.teeClass == teeClass));
    var gc := (o: Offer) => (if k(o) then o.(claimed := (o.claimed + 1)) else o);
    var gr := (o: Offer) => (if k(o) then o.(claimed := (o.claimed - 1)) else o);
    assert mid.offers == seq(|m.offers|, i requires 0 <= i < |m.offers| => gc(m.offers[i]));
    var w :| w in m.offers && (k(w) && (w.claimed < w.capacity));
    OfferFacts(m, w);
    var wi :| 0 <= wi < |m.offers| && m.offers[wi] == w;
    assert mid.offers[wi] == gc(w);
    assert gc(w) in mid.offers;
    assert gc(w) in mid.offers && sameOfferKey(gc(w), provider, region, teeClass) && gc(w).claimed > 0;
    assert exists o :: o in mid.offers && (sameOfferKey(o, provider, region, teeClass) && (o.claimed > 0)) by {
      assert gc(w) in mid.offers && (sameOfferKey(gc(w), provider, region, teeClass) && (gc(w).claimed > 0));
    }
    assert canRelease(mid, provider, region, teeClass);
    assert end.offers == seq(|mid.offers|, i requires 0 <= i < |mid.offers| => gr(mid.offers[i]));
    assert |end.offers| == |m.offers|;
    assert forall i :: 0 <= i < |m.offers| ==> end.offers[i] == m.offers[i];
    assert end.offers == m.offers;
    assert end == m;
  }
}
