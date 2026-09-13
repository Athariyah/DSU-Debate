# DSU Debate — privacy checklist

The application processes the following data:

- optional voter name;
- IP address used for one-vote-per-event protection;
- a browser-generated UUID stored in local storage and sent as a device token;
- administrator email and password hash.

Before public deployment, the operator must publish a privacy notice that explains:

1. the purpose and legal basis of processing;
2. the anti-fraud checks and their limitations;
3. retention periods for votes, IP addresses and device tokens;
4. who can access administrator and voting data;
5. deletion/access/contact procedures;
6. the responsible data controller and hosting location.

The backend should be configured with a retention job or an explicit data deletion
policy. Do not expose raw IP addresses in public API responses or logs. Production
secrets, the seed administrator password and `ADMIN_REGISTRATION_KEY` must be supplied
through a secret manager, never committed to the repository.
