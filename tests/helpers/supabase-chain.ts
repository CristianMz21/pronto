// Helper to build chainable supabase mock that supports .from().select().eq().maybeSingle() etc.
// Usage: const chain = createSupabaseChain({ data: yourData, error: null })
export function createSupabaseChain(
  result: { data: any; error: any } = { data: null, error: null },
) {
  const chain: any = {}
  const methods = [
    'select',
    'insert',
    'update',
    'upsert',
    'delete',
    'eq',
    'neq',
    'or',
    'in',
    'single',
    'maybeSingle',
    'order',
    'limit',
    'range',
    'ilike',
    'gte',
    'lte',
    'gt',
    'lt',
  ]
  methods.forEach((m) => {
    chain[m] = (..._args: any[]) => chain
  })
  chain.then = (resolve: any) => Promise.resolve(result).then(resolve)
  // Make chain awaitable: supabase.from().select().eq() should resolve to result
  // Vitest/supabase pattern uses `await supabase.from().select().eq()`
  chain._result = result
  // Override thenable to resolve
  const promise = Promise.resolve(result)
  Object.assign(chain, promise)
  // Ensure chain methods return thenable chain
  methods.forEach((m) => {
    const _orig = chain[m]
    chain[m] = (..._args: any[]) => {
      // keep chain thenable
      return chain
    }
  })
  // But we need chain to be awaitable: implement then/catch
  chain.then = promise.then.bind(promise)
  chain.catch = promise.catch.bind(promise)
  return chain
}

export function mockSupabaseClient(overrides: Record<string, any> = {}) {
  const defaultChain = createSupabaseChain({ data: null, error: null })
  return {
    from: () => defaultChain,
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      signInWithPassword: async () => ({ data: {}, error: null }),
      signUp: async () => ({ data: {}, error: null }),
    },
    storage: {
      from: () => ({
        upload: async () => ({ data: {}, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: 'http://example.com/img.jpg' } }),
      }),
    },
    ...overrides,
  }
}
