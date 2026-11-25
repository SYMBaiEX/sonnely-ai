lemma lawFlagSearchFindsEveryCarrier_ensures(customers: seq<Customer>)
  ensures (lawFlagSearchFindsEveryCarrier(customers) == true)
{
  forall c | c in customers
    ensures forall f :: f in c.flags ==> c in listed(customers, "", f, "any", false)
  {
    forall f | f in c.flags
      ensures c in listed(customers, "", f, "any", false)
    {
      ProofLib.FilterMember((c: Customer) => (((matches(c, "") && ((f == "") || (f in c.flags))) && (("any" == "any") || (("any" == "funded") == c.funded))) && (!(false) || c.active)), customers, c);
    }
  }
}

lemma lawListedRowsComeFromTheDirectory_ensures(customers: seq<Customer>, search: string, flag: string, funded: string, activeOnly: bool)
  ensures (lawListedRowsComeFromTheDirectory(customers, search, flag, funded, activeOnly) == true)
{
  forall c | c in listed(customers, search, flag, funded, activeOnly)
    ensures c in customers
  {
    ProofLib.FilterMember((c: Customer) => (((matches(c, search) && ((flag == "") || (flag in c.flags))) && ((funded == "any") || ((funded == "funded") == c.funded))) && (!(activeOnly) || c.active)), customers, c);
  }
}
