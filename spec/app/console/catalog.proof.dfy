// Proof of the catalog unit's four law obligations. Every law is a
// conjunction of the same predicate over the six provider chunks; each
// chunk's predicate is decidable on the literal const, so the chunk lemmas
// are empty and the laws only call them.

lemma lawCatalogProvidersAreKnown_ensures(at: int)
  ensures (lawCatalogProvidersAreKnown(at) == true)
{
  KnownN();
  KnownB();
  KnownC();
  KnownPA();
  KnownPB();
  KnownT();
}

lemma lawChatRoutesPriceTokens_ensures(at: int)
  ensures (lawChatRoutesPriceTokens(at) == true)
{
  PricedN();
  PricedB();
  PricedC();
  PricedPA();
  PricedPB();
  PricedT();
}

lemma lawRatesAreWhole_ensures(at: int)
  ensures (lawRatesAreWhole(at) == true)
{
  WholeN();
  WholeB();
  WholeC();
  WholePA();
  WholePB();
  WholeT();
}

lemma lawProviderChatIdsUnique_ensures(at: int)
  ensures (lawProviderChatIdsUnique(at) == true)
{
  UniqueN();
  UniqueB();
  UniqueC();
  UniquePA();
  UniquePB();
  UniqueT();
}

// ---- helpers ----

lemma KnownN()
  ensures providersKnown(nearA)
{
}

lemma KnownB()
  ensures providersKnown(nearB)
{
}

lemma KnownC()
  ensures providersKnown(nearC)
{
}

lemma KnownPA()
  ensures providersKnown(phalaA)
{
}

lemma KnownPB()
  ensures providersKnown(phalaB)
{
}

lemma KnownT()
  ensures providersKnown(tinfoil)
{
}

lemma PricedN()
  ensures chatRoutesPriced(nearA)
{
}

lemma PricedB()
  ensures chatRoutesPriced(nearB)
{
}

lemma PricedC()
  ensures chatRoutesPriced(nearC)
{
}

lemma PricedPA()
  ensures chatRoutesPriced(phalaA)
{
}

lemma PricedPB()
  ensures chatRoutesPriced(phalaB)
{
}

lemma PricedT()
  ensures chatRoutesPriced(tinfoil)
{
}

lemma WholeN()
  ensures ratesWhole(nearA)
{
}

lemma WholeB()
  ensures ratesWhole(nearB)
{
}

lemma WholeC()
  ensures ratesWhole(nearC)
{
}

lemma WholePA()
  ensures ratesWhole(phalaA)
{
}

lemma WholePB()
  ensures ratesWhole(phalaB)
{
}

lemma WholeT()
  ensures ratesWhole(tinfoil)
{
}

lemma UniqueN()
  ensures chatIdsOncePerProvider(nearA)
{
  forall m | m in nearA
    ensures !(exists r :: r in m.routes && !(r.endpoint != "chat/completions" || |Std.Collections.Seq.Filter((x: ModelRoute) => ((x.endpoint == "chat/completions") && (x.modelId == r.modelId)), m.routes)| == 1))
  {
    reveal Std.Collections.Seq.Filter();
  }
}

lemma UniqueB()
  ensures chatIdsOncePerProvider(nearB)
{
  forall m | m in nearB
    ensures !(exists r :: r in m.routes && !(r.endpoint != "chat/completions" || |Std.Collections.Seq.Filter((x: ModelRoute) => ((x.endpoint == "chat/completions") && (x.modelId == r.modelId)), m.routes)| == 1))
  {
    reveal Std.Collections.Seq.Filter();
  }
}

lemma UniqueC()
  ensures chatIdsOncePerProvider(nearC)
{
  forall m | m in nearC
    ensures !(exists r :: r in m.routes && !(r.endpoint != "chat/completions" || |Std.Collections.Seq.Filter((x: ModelRoute) => ((x.endpoint == "chat/completions") && (x.modelId == r.modelId)), m.routes)| == 1))
  {
    reveal Std.Collections.Seq.Filter();
  }
}

lemma UniquePA()
  ensures chatIdsOncePerProvider(phalaA)
{
  forall m | m in phalaA
    ensures !(exists r :: r in m.routes && !(r.endpoint != "chat/completions" || |Std.Collections.Seq.Filter((x: ModelRoute) => ((x.endpoint == "chat/completions") && (x.modelId == r.modelId)), m.routes)| == 1))
  {
    reveal Std.Collections.Seq.Filter();
  }
}

lemma UniquePB()
  ensures chatIdsOncePerProvider(phalaB)
{
  forall m | m in phalaB
    ensures !(exists r :: r in m.routes && !(r.endpoint != "chat/completions" || |Std.Collections.Seq.Filter((x: ModelRoute) => ((x.endpoint == "chat/completions") && (x.modelId == r.modelId)), m.routes)| == 1))
  {
    reveal Std.Collections.Seq.Filter();
  }
}

lemma UniqueT()
  ensures chatIdsOncePerProvider(tinfoil)
{
  forall m | m in tinfoil
    ensures !(exists r :: r in m.routes && !(r.endpoint != "chat/completions" || |Std.Collections.Seq.Filter((x: ModelRoute) => ((x.endpoint == "chat/completions") && (x.modelId == r.modelId)), m.routes)| == 1))
  {
    reveal Std.Collections.Seq.Filter();
  }
}
