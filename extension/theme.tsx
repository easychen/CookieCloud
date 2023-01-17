import { ConfigProvider } from "antd"
import type { ReactNode } from "react"

export const ThemeProvider = ({ children = null as ReactNode }) => (
  <ConfigProvider
    theme={{
      token: {
        colorPrimary: "#1096f5"
      }
    }}>
    {children}
    </ConfigProvider>
)
