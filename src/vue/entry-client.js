import { ref } from 'vue'
import viteSSR, { ClientOnly } from 'vite-ssr/vue/entry-client'
import { buildPropsRoute, fetchPageProps } from '../utils/props'
import { createHead } from '@vueuse/head'
import { onFunctionReload, setupPropsEndpointsWatcher } from '../dev/hmr'

export { ClientOnly }
export { useContext } from 'vite-ssr/vue/entry-client'

export default function (App, { routes, ...options }, hook) {
  if (import.meta.env.DEV) {
    // Will be used in HMR later
    routes.forEach((route) => {
      route.meta = route.meta || {}
      route.meta.hmr = ref(false)
    })
  }

  return viteSSR(
    App,
    { routes, ...options },
    async ({ app, router, isClient, initialRoute, initialState }) => {
      const head = createHead()
      app.use(head)

      app.component(ClientOnly.name, ClientOnly)

      if (import.meta.hot) {
        setupPropsEndpointsWatcher()
        onFunctionReload(
          () => router.currentRoute.value,
          async (route) => {
            const propsRoute = buildPropsRoute(route)
            if (propsRoute) {
              const { data, redirect } = await fetchPageProps(
                propsRoute.fullPath
              )

              if (redirect) {
                router.replace(redirect)
              } else {
                route.meta.state = data
                // Trigger reactivity:
                route.meta.hmr.value = !route.meta.hmr.value
              }
            }
          }
        )
      }

      let isFirstRoute = true
      router.beforeEach((to, from) => {
        if (isFirstRoute) {
          isFirstRoute = false
          if (!!to.meta.state) {
            // Do not get props the first time for the entry
            // route since it is already rendered in the server.
            return
          }
        }

        if (from && to.path === from.path) {
          // Keep state when changing hash/query in the same route
          to.meta.state = from.meta.state
          return
        }

        const propsRoute = buildPropsRoute(to)
        if (propsRoute) {
          // Asynchronous promise to enable downloading
          // page component and props in parallel.
          to.meta.statePromise = fetchPageProps(propsRoute.fullPath)
        }
      })

      router.beforeResolve(async (to) => {
        const { statePromise } = to.meta || {}
        if (statePromise) {
          to.meta.statePromise = null

          const { data, redirect } = await statePromise

          if (redirect) {
            return redirect
          }

          to.meta.state = data
        }
      })

      if (hook) {
        await hook({ app, router, isClient, initialState, initialRoute })
      }
    }
  )
}
