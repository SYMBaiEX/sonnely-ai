export function usePathname() {
  return window.location.pathname;
}

export function useRouter() {
  return {
    push(href: string) {
      window.location.href = href;
    },
  };
}
