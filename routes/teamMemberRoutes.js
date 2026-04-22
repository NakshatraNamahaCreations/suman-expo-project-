const router = require("express").Router();
const controller = require("../controllers/teamMemberController");

// ═══════════════════════════════════════════════════════════════
// TEAM MEMBER ROUTES
// ═══════════════════════════════════════════════════════════════

// Get all team members
router.get("/", controller.getAllTeamMembers);

// Get single team member
router.get("/:id", controller.getTeamMember);

// Create team member
router.post("/", controller.createTeamMember);

// Update team member
router.put("/:id", controller.updateTeamMember);

// Delete team member
router.delete("/:id", controller.deleteTeamMember);

// Team member login
router.post("/auth/login", controller.teamMemberLogin);

module.exports = router;
