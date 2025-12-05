import { Router } from "express";
import { krakenService } from "../services/krakenService";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const connection = await krakenService.testConnection();
    const balance = await krakenService.testBalanceAccess();
    const status = krakenService.getStatus();

    return res.json({
      success: true,
      tests: {
        connection,
        balance,
        status
      }
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Unknown error"
    });
  }
});

export default router;