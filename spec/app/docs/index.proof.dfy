lemma lawDocAtFinds_ensures(i: int)
  ensures (lawDocAtFinds(i) == true)
{
  if 0 <= i < |docs| {
    forall m | i < m < |docs|
      ensures docs[m].slug != docs[i].slug
    {
      lawSlugListedOnce_ensures(i, m);
    }
    foldFinds(docs, docs[i].slug, emptyDoc, i);
  }
}

// docAt's fold returns the last element whose slug matches, so the one doc
// carrying the slug — listed once, by lawSlugListedOnce — is the one found.
lemma foldFinds(xs: seq<Doc>, slug: string, init: Doc, j: int)
  requires 0 <= j < |xs|
  requires xs[j].slug == slug
  requires forall m :: j < m < |xs| ==> xs[m].slug != slug
  ensures Std.Collections.Seq.FoldLeft((found: Doc, d: Doc) => (if (d.slug == slug) then d else found), init, xs) == xs[j]
  decreases |xs|
{
  if j == 0 {
    foldSkips(xs[1..], slug, xs[0]);
  } else {
    foldFinds(xs[1..], slug, if (xs[0].slug == slug) then xs[0] else init, j - 1);
  }
}

lemma foldSkips(xs: seq<Doc>, slug: string, init: Doc)
  requires forall m :: 0 <= m < |xs| ==> xs[m].slug != slug
  ensures Std.Collections.Seq.FoldLeft((found: Doc, d: Doc) => (if (d.slug == slug) then d else found), init, xs) == init
  decreases |xs|
{
  if |xs| > 0 {
    foldSkips(xs[1..], slug, init);
  }
}
