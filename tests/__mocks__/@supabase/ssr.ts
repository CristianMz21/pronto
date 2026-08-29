export const createBrowserClient = () => ({ from: () => ({}) })
export const createServerClient = () => ({
  auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
  from: () => ({}),
})
