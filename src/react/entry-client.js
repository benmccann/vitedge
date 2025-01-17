import React, { useState } from 'react'
import { Redirect } from 'react-router-dom'
import viteSSR from 'vite-ssr/react/entry-client'
import { buildPropsRoute, fetchPageProps } from '../utils/props'
import { onFunctionReload, setupPropsEndpointsWatcher } from '../dev/hmr'

export { ClientOnly, useContext } from 'vite-ssr/react/entry-client'

export default function (App, { routes, ...options }, hook) {
  return viteSSR(App, { routes, PropsProvider, ...options }, async (ctx) => {
    if (import.meta.hot) {
      setupPropsEndpointsWatcher()
      onFunctionReload(ctx.router.getCurrentRoute, fetchPagePropsAsync)
    }

    if (hook) {
      await hook(ctx)
    }
  })
}

function fetchPagePropsAsync(route, setState = (route.meta || {}).setState) {
  const propsRoute = buildPropsRoute(route)

  if (propsRoute) {
    fetchPageProps(propsRoute.fullPath).then(({ redirect, data }) => {
      route.meta.state = redirect ? { __redirect: redirect } : data
      setState(route.meta.state)
    })
  }

  return !!propsRoute
}

let lastRoutePath
function PropsProvider({
  from,
  to,
  pagePropsOptions,
  children: Page,
  ...rest
}) {
  // This code can run because of a rerrender (same route) or because changing routes.
  // We only want to refresh props in the second case.
  const isChangingRoute = !!lastRoutePath && lastRoutePath !== to.path
  lastRoutePath = to.path

  const [state, setState] = useState(to.meta.state)

  if (state && state.__redirect) {
    to.meta.state = null
    return React.createElement(Redirect, { to: state.__redirect })
  }

  if (import.meta.env.DEV) {
    // For props HMR
    to.meta.setState = setState
  }

  let isLoadingProps = false
  let isRevalidatingProps = false

  if (!to.meta.state || isChangingRoute) {
    if (from && to.path === from.path) {
      // Keep state when changing hash/query in the same route
      to.meta.state = from.meta.state || {}
      setState(from.meta.state)
    } else {
      to.meta.state = {}

      const isFetching = fetchPagePropsAsync(to, setState)

      if (isFetching) {
        if (state) {
          isRevalidatingProps = true
        } else {
          isLoadingProps = true
        }
      }
    }
  }

  const { passToPage } = pagePropsOptions || {}
  return React.createElement(Page, {
    isLoadingProps,
    isRevalidatingProps,
    ...((passToPage && state) || {}),
    ...rest,
  })
}
