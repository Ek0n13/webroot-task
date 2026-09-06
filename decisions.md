## Decisions I took while attempting to complete the task

#### Initial scaffolding:
1. I reached for tanstack start, because I am familiar with it from my electron pdf reader app and working at UP.
2. After some Googling, I reached for Vercel AI SDK as I see it a lot on Twitter and I always wanted to try it.
3. I told my LLM to use both of the above and Zod for schema validation, as I am already familiar with it.

#### First read-through:
1. I realised that calling an LLM with an unknown call duration should have its own request context (should be done asynchronously).
2. I remember at UP we had a lot of workers with RabbitMQ, but because I don't understand how RabbitMQ works and it is a massive overkill for this, I decided to just use pg-boss that just works out of the box with Postgres.
3. At this point it's obvious I need a monorepo to have a database package and a separate worker app.

#### First monorepo attempt
1. I realised astra overcomplicated the backend. So ,while trying to reason about it, I have tried to simplify it.