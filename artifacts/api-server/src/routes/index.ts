import { Router } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import restaurantsRouter from "./restaurants";
import subscriptionsRouter from "./subscriptions";
import categoriesRouter from "./categories";
import productsRouter from "./products";
import driversRouter from "./drivers";
import ordersRouter from "./orders";
import publicRouter from "./public";
import analyticsRouter from "./analytics";
import notificationsRouter from "./notifications";
import settingsRouter from "./settings";
import storageRouter from "./storage";
import uploadsRouter from "./uploads";
import telegramRouter from "./telegram";

const router = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(restaurantsRouter);
router.use(subscriptionsRouter);
router.use(categoriesRouter);
router.use(productsRouter);
router.use(driversRouter);
router.use(ordersRouter);
router.use(publicRouter);
router.use(analyticsRouter);
router.use(notificationsRouter);
router.use(settingsRouter);
router.use(storageRouter);
router.use(uploadsRouter);
router.use(telegramRouter);

export default router;
