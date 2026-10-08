# შიდა აუდიტის გეგმა (Supabase + Vercel)

ვებ-აპლიკაცია ბიზნეს-პროცესების რისკის შესაფასებლად, აუდიტის პრიორიტეტების დასადგენად და მომავალი წლის რისკზე დაფუძნებული გეგმის შესადგენად.

- **Frontend:** Vite + JavaScript (ფრეიმვორკის გარეშე)
- **ბაზა და ავტორიზაცია:** Supabase (Postgres + Auth + Row Level Security)
- **ჰოსტინგი:** Vercel

## პროექტის სტრუქტურა

```
audit-plan-app/
├── index.html            # HTML-ის საწყისი გვერდი
├── src/
│   ├── main.js           # აპლიკაციის ლოგიკა: შეფასება, გეგმა, UI
│   ├── supabase.js       # Supabase-ის კლიენტი
│   └── style.css         # სტილები (ღია და მუქი თემა)
├── supabase/
│   ├── schema.sql        # ცხრილები, ტრიგერები, RLS პოლიტიკები
│   └── seed.sql          # 25 სანიმუშო პროცესი ბანკისთვის
├── .env.example          # გარემოს ცვლადების ნიმუში
└── package.json
```

---

## 1. Supabase

1. შედით [supabase.com](https://supabase.com)-ზე და შექმენით ახალი პროექტი (**New project**).
2. გახსენით **SQL Editor → New query**, ჩასვით `supabase/schema.sql`-ის შიგთავსი და დააჭირეთ **Run**.
3. (არასავალდებულო) იგივე გააკეთეთ `supabase/seed.sql`-ისთვის, თუ სანიმუშო მონაცემები გჭირდებათ.
4. **Authentication → Sign In / Providers → Email**: გამორთეთ **Allow new users to sign up**, რომ სისტემაში სხვამ ვერ დარეგისტრირდეს.
5. **Authentication → Users → Add user → Create new user**: შექმენით მომხმარებლები (ელფოსტა + პაროლი) აუდიტის გუნდის თითოეული წევრისთვის.
6. **Project Settings → API**: დააკოპირეთ **Project URL** და **anon public** გასაღები.

> `anon` გასაღების გამოყენება ბრაუზერში უსაფრთხოა: მონაცემებს RLS იცავს და მათზე წვდომა მხოლოდ ავტორიზებულ მომხმარებლებს აქვთ. **`service_role` გასაღები არასოდეს ჩასვათ ამ პროექტში.**

## 2. ლოკალური გაშვება (შემოწმებისთვის)

საჭიროა [Node.js](https://nodejs.org) 18 ან უფრო ახალი ვერსია.

```bash
cp .env.example .env      # შემდეგ .env-ში ჩაწერეთ URL და anon გასაღები
npm install
npm run dev               # გაიხსნება http://localhost:5173
```

## 3. GitHub

```bash
git init
git add .
git commit -m "Audit plan app"
git branch -M main
git remote add origin https://github.com/<თქვენი-მომხმარებელი>/audit-plan-app.git
git push -u origin main
```

GitHub-ზე წინასწარ შექმენით ცარიელი რეპოზიტორია (**New repository**, README-ს გარეშე). `.env` ფაილი `.gitignore`-შია და GitHub-ზე არ აიტვირთება.

## 4. Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project** → აირჩიეთ GitHub-ის რეპოზიტორია.
2. **Framework Preset** ავტომატურად იქნება **Vite** (Build: `npm run build`, Output: `dist`).
3. **Environment Variables** განყოფილებაში დაამატეთ:
   - `VITE_SUPABASE_URL` — თქვენი Project URL
   - `VITE_SUPABASE_ANON_KEY` — anon public გასაღები
4. დააჭირეთ **Deploy**.

ამის შემდეგ ყოველი `git push` ავტომატურად განაახლებს საიტს. თუ ცვლადებს მოგვიანებით შეცვლით, გაუშვით **Deployments → Redeploy**.

> თუ პაროლის აღდგენას ან მოწვევის ბმულებს გამოიყენებთ, Supabase-ში **Authentication → URL Configuration → Site URL** ველში ჩაწერეთ Vercel-ის მისამართი.

---

## როგორ მუშაობს მოდელი

| ნაბიჯი | ლოგიკა |
|---|---|
| შეფასება | F1–F5 ფასდება 1–5 შკალით: ფინანსური გავლენა, მარეგულირებელი რისკი, სირთულე, თაღლითობა, კონტროლის გარემო. F6 (ბოლო აუდიტიდან გასული დრო) ავტომატურად ითვლება. |
| ქულა | Σ (ფაქტორი × წონა). წონები იცვლება „Параметры“ ჩანართზე. |
| რეიტინგი | ≥ 3.6 მაღალი, ≥ 2.6 საშუალო, დანარჩენი დაბალი (ზღვრები ცვლადია). |
| გეგმაში ჩართვა | სავალდებულო, მაღალი რისკი, ციკლი ამოიწურა ან არასოდეს შემოწმებულა. |
| რესურსი | ჯერ სავალდებულო, მერე ქულის კლებით, სანამ არ ამოიწურება ხელმისაწვდომი კაც-დღეები. დანარჩენი გადადის. |
| კვარტლები | ავტომატურად ნაკლებად დატვირთულ კვარტალში, ან ხელით. |

ცვლილებები ავტომატურად ინახება Supabase-ში, ასე რომ ყველა მომხმარებელი ერთსა და იმავე მონაცემებს ხედავს.
