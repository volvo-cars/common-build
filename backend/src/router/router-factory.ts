import Router from 'koa-router'
export interface RouterFactory {
    buildRouter(): Promise<Router>
}