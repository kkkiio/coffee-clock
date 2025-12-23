import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@remix-run/react";
import type { LinksFunction } from "@remix-run/node";

import bootstrapCss from "bootstrap/dist/css/bootstrap.min.css?url";
import bootstrapIconsCss from "bootstrap-icons/font/bootstrap-icons.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: bootstrapCss },
  { rel: "stylesheet", href: bootstrapIconsCss },
];

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  return (
    <html lang="en">
      <head>
        <title>Oh no!</title>
        <Meta />
        <Links />
      </head>
      <body>
        <div className="container py-5">
          <div className="alert alert-danger">
            <h4 className="alert-heading">Application Error</h4>
            <p>
              Something went wrong. Please check the console logs for more
              details.
            </p>
            <hr />
            <a href="/" className="btn btn-primary">
              Return to Home
            </a>
          </div>
        </div>
        <Scripts />
      </body>
    </html>
  );
}
