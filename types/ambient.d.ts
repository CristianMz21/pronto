/* eslint-disable */

declare module 'gel' {}
declare module 'mysql2/promise' {}
declare module '@supabase/phoenix/priv/static/types/timer' {
  export class Timer {}
}
declare module '@supabase/phoenix/priv/static/types/types' {
  // biome-ignore lint/suspicious/noExplicitAny: ambient type requires any
  export type Socket = any
}

import * as React from 'react'

declare global {
  namespace JSX {
    interface Element extends React.ReactElement {}
    // biome-ignore lint/suspicious/noExplicitAny: ambient type requires any
    interface ElementClass extends React.Component<any> {}
    interface ElementAttributesProperty {
      props: {}
    }
    interface IntrinsicElements extends React.JSX.IntrinsicElements {}
  }
}
