import bcrypt from "bcrypt";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, PrizeType } from "@prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5433/gift_safe",
  }),
});

const prizes = [
  {
    code: "promo-10",
    title: "Промокод на скидку 10%",
    description: "Скидка 10% на следующий заказ.",
    image: "/assets/prizes/promo-10.webp",
    weight: 350,
    type: PrizeType.PROMO_CODE,
    payload: { discount: 10 },
    requiresAddress: false,
  },
  {
    code: "free-shipping",
    title: "Бесплатная доставка",
    description: "Забирай заказ без оплаты доставки.",
    image: "/assets/prizes/free-shipping.webp",
    weight: 250,
    type: PrizeType.FREE_SHIPPING,
    payload: { shipping: "free" },
    requiresAddress: false,
  },
  {
    code: "promo-15",
    title: "Промокод на скидку 15%",
    description: "Чуть больше выгоды для следующей покупки.",
    image: "/assets/prizes/promo-15.webp",
    weight: 150,
    type: PrizeType.PROMO_CODE,
    payload: { discount: 15 },
    requiresAddress: false,
  },
  {
    code: "bonus-100",
    title: "100 бонусов на счет",
    description: "Бонусы появятся после подтверждения приза.",
    image: "/assets/prizes/bonus-100.webp",
    weight: 100,
    type: PrizeType.BONUS_POINTS,
    payload: { amount: 100 },
    requiresAddress: false,
  },
  {
    code: "promo-20",
    title: "Промокод на скидку 20%",
    description: "Редкий выигрыш с приятной скидкой.",
    image: "/assets/prizes/promo-20.webp",
    weight: 60,
    type: PrizeType.PROMO_CODE,
    payload: { discount: 20 },
    requiresAddress: false,
  },
  {
    code: "guide",
    title: "Гайд от наших экспертов",
    description: "Полезный PDF-гид придет на email.",
    image: "/assets/prizes/guide.webp",
    weight: 40,
    type: PrizeType.GUIDE,
    payload: { format: "pdf" },
    requiresAddress: false,
  },
  {
    code: "bonus-500",
    title: "500 бонусов на счет",
    description: "Почти мини-джекпот для личного кабинета.",
    image: "/assets/prizes/bonus-500.webp",
    weight: 20,
    type: PrizeType.BONUS_POINTS,
    payload: { amount: 500 },
    requiresAddress: false,
  },
  {
    code: "orange-paste",
    title: "Оранжевая паста",
    description: "Физический мини-подарок с доставкой.",
    image: "/assets/prizes/orange-paste.webp",
    weight: 10,
    type: PrizeType.PHYSICAL,
    payload: null,
    requiresAddress: true,
  },
  {
    code: "socks",
    title: "Носочки (1 шт)",
    description: "Небольшой, но приятный подарок.",
    image: "/assets/prizes/socks.webp",
    weight: 10,
    type: PrizeType.PHYSICAL,
    payload: null,
    requiresAddress: true,
  },
  {
    code: "nose-trimmer",
    title: "Триммер для носа 001",
    description: "Редкий физический приз.",
    image: "/assets/prizes/nose-trimmer.webp",
    weight: 5,
    type: PrizeType.PHYSICAL,
    payload: null,
    requiresAddress: true,
  },
  {
    code: "gift-box",
    title: "Подарочный бокс",
    description: "Собранный сюрприз для победителя.",
    image: "/assets/prizes/gift-box.webp",
    weight: 5,
    type: PrizeType.GIFT_BOX,
    payload: null,
    requiresAddress: true,
  },
  {
    code: "bonus-1000",
    title: "1000 бонусов",
    description: "Джекпот для самых везучих.",
    image: "/assets/prizes/bonus-1000.webp",
    weight: 5,
    type: PrizeType.BONUS_POINTS,
    payload: { amount: 1000 },
    requiresAddress: false,
  },
];

function buildPromoCodes(prizeCode, prefix, count) {
  return Array.from({ length: count }, (_, index) => ({
    prizeCode,
    code: `${prefix}-${String(index + 1).padStart(4, "0")}`,
  }));
}

const promoCodes = [
  ...buildPromoCodes("promo-10", "PROMO10", 50),
  ...buildPromoCodes("promo-15", "PROMO15", 30),
  ...buildPromoCodes("promo-20", "PROMO20", 20),
];

async function main() {
  for (const prize of prizes) {
    await prisma.prize.upsert({
      where: { code: prize.code },
      update: prize,
      create: prize,
    });
  }

  for (const promoCode of promoCodes) {
    await prisma.promoCodePool.upsert({
      where: { code: promoCode.code },
      update: {
        prizeCode: promoCode.prizeCode,
      },
      create: promoCode,
    });
  }

  await prisma.settings.upsert({
    where: { id: "singleton" },
    update: {
      active: true,
      prizeTtlHours: 24,
      guidePdfUrl: process.env.GUIDE_PDF_URL || null,
    },
    create: {
      id: "singleton",
      active: true,
      prizeTtlHours: 24,
      guidePdfUrl: process.env.GUIDE_PDF_URL || null,
    },
  });

  const passwordHash = await bcrypt.hash(
    process.env.ADMIN_PASSWORD || "admin123",
    Number(process.env.BCRYPT_ROUNDS || 10),
  );

  await prisma.admin.upsert({
    where: { login: process.env.ADMIN_LOGIN || "admin" },
    update: {
      passwordHash,
    },
    create: {
      login: process.env.ADMIN_LOGIN || "admin",
      passwordHash,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
