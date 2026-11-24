# Adzesua HQ server (SMS gateway)

This folder holds the small server part of Adzesua HQ. It runs on Firebase Cloud Functions
in project `adzesua-hq-83a9f` and does one job: send SMS through Arkesel.

The Arkesel API key is stored **only** as a Firebase secret called `ARKESEL_API_KEY`.
It is never written in this code, in HQ, or on GitHub.

## Functions

| Function | What it does | Who can use it |
|---|---|---|
| `smsSend` | Sends a message typed on the SMS page | Admin, Business Development, Finance (non-admins: up to 20 people at once) |
| `smsReceipt` | Texts a receipt when a payment is recorded (or on request) | Anyone who can edit invoices |
| `smsReminder` | Texts a payment reminder for an invoice | Anyone who can edit invoices |
| `smsAccessAlert` | Texts the MD when someone uninvited asks for access | Automatic, once per person |
| `smsTest`, `smsBalance` | Test message and Arkesel balance | Admin |
| `smsDaily` | 7:30 every morning: overdue reminders and the MD's summary | Automatic |

Every message is logged in the `sms` collection. A daily limit (set in HQ → SMS messages → Settings)
stops sending for the day once reached.

## Deploy (Google Cloud Shell, nothing to install)

1. The Firebase project must be on the **Blaze** plan.
2. Open https://shell.cloud.google.com/?project=adzesua-hq-83a9f signed in with the Google account that owns the Firebase project.
3. Run:

```bash
git clone https://github.com/KWESI-BAAH/adzesua-connect-website.git adz
cd adz/hq-server
npm --prefix functions install
firebase login --no-localhost        # only if a later command says you are not logged in
firebase functions:secrets:set ARKESEL_API_KEY   # paste the key when asked; it stays hidden
firebase deploy --only functions,firestore:rules
```

If asked how many days to keep container images, press Enter (the default keeps costs at zero).

To update later: `cd ~/adz && git pull && cd hq-server && firebase deploy --only functions,firestore:rules`.
To change the Arkesel key: run the `secrets:set` line again, then deploy again.

## Short link (Firebase Hosting)

HQ is also served at https://adzesuahq.web.app. Publish or update it with:

```bash
cd ~/adz && git pull && cd hq-server && firebase deploy --only hosting
```

The first time only, create the site: `firebase hosting:sites:create adzesuahq`.
