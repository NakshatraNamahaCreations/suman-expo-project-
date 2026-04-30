const TeamMember = require("../models/TeamMember");

// ══════════════════════════════════════════════════════════════════
// GET ALL TEAM MEMBERS
// ══════════════════════════════════════════════════════════════════
exports.getAllTeamMembers = async (req, res) => {
  try {
    const members = await TeamMember.find().select("-password");
    res.json({
      success: true,
      data: members,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch team members",
      error: error.message,
    });
  }
};

// ══════════════════════════════════════════════════════════════════
// CREATE TEAM MEMBER
// ══════════════════════════════════════════════════════════════════
exports.createTeamMember = async (req, res) => {
  try {
    const { name, email, phone, password, permissions, role } = req.body;

    // Validate required fields
    if (!name || !email || !phone || !password) {
      return res.status(400).json({
        message: "Name, email, phone, and password are required",
      });
    }

    // Check if email already exists
    const existingEmail = await TeamMember.findOne({ email });
    if (existingEmail) {
      return res.status(409).json({
        message: "Email already exists",
      });
    }

    // Check if phone already exists
    const existingPhone = await TeamMember.findOne({ phone });
    if (existingPhone) {
      return res.status(409).json({
        message: "Phone number already exists",
      });
    }

    // Create new team member
    const newMember = new TeamMember({
      name,
      email,
      phone,
      password, // Stored as plain text (user requested)
      role: role || "Executive",
      permissions: permissions || [],
      status: "active",
      createdBy: req.user?._id, // If authenticated
    });

    await newMember.save();

    res.status(201).json({
      success: true,
      message: "Team member created successfully",
      data: newMember.toJSON(),
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to create team member",
      error: error.message,
    });
  }
};

// ══════════════════════════════════════════════════════════════════
// UPDATE TEAM MEMBER
// ══════════════════════════════════════════════════════════════════
exports.updateTeamMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, password, permissions, status, role } = req.body;

    const member = await TeamMember.findById(id);
    if (!member) {
      return res.status(404).json({
        message: "Team member not found",
      });
    }

    // Check if new email is unique (if changed)
    if (email && email !== member.email) {
      const existingEmail = await TeamMember.findOne({ email });
      if (existingEmail) {
        return res.status(409).json({
          message: "Email already exists",
        });
      }
    }

    // Check if new phone is unique (if changed)
    if (phone && phone !== member.phone) {
      const existingPhone = await TeamMember.findOne({ phone });
      if (existingPhone) {
        return res.status(409).json({
          message: "Phone number already exists",
        });
      }
    }

    // Update fields
    if (name) member.name = name;
    if (email) member.email = email;
    if (phone) member.phone = phone;
    if (password) member.password = password;
    if (role) member.role = role;
    if (permissions) member.permissions = permissions;
    if (status) member.status = status;

    member.updatedAt = new Date();
    await member.save();

    res.json({
      success: true,
      message: "Team member updated successfully",
      data: member.toJSON(),
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to update team member",
      error: error.message,
    });
  }
};

// ══════════════════════════════════════════════════════════════════
// DELETE TEAM MEMBER
// ══════════════════════════════════════════════════════════════════
exports.deleteTeamMember = async (req, res) => {
  try {
    const { id } = req.params;

    const member = await TeamMember.findByIdAndDelete(id);
    if (!member) {
      return res.status(404).json({
        message: "Team member not found",
      });
    }

    res.json({
      success: true,
      message: "Team member deleted successfully",
      data: member.toJSON(),
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to delete team member",
      error: error.message,
    });
  }
};

// ══════════════════════════════════════════════════════════════════
// TEAM MEMBER LOGIN
// ══════════════════════════════════════════════════════════════════
exports.teamMemberLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    // Find team member by email
    const member = await TeamMember.findOne({ email });

    if (!member) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    // Check status
    if (member.status !== "active") {
      return res.status(403).json({
        message: "This account is inactive",
      });
    }

    // Check password (plain text comparison - user requested)
    if (member.password !== password) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    // Update last login
    member.lastLogin = new Date();
    await member.save();

    // Return member data with permissions
    res.json({
      success: true,
      message: "Login successful",
      data: {
        _id: member._id,
        name: member.name,
        email: member.email,
        phone: member.phone,
        role: member.role,
        permissions: member.permissions,
        status: member.status,
      },
    });
  } catch (error) {
    res.status(500).json({
      message: "Login failed",
      error: error.message,
    });
  }
};

// ══════════════════════════════════════════════════════════════════
// GET SINGLE TEAM MEMBER
// ══════════════════════════════════════════════════════════════════
exports.getTeamMember = async (req, res) => {
  try {
    const { id } = req.params;

    const member = await TeamMember.findById(id).select("-password");
    if (!member) {
      return res.status(404).json({
        message: "Team member not found",
      });
    }

    res.json({
      success: true,
      data: member,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch team member",
      error: error.message,
    });
  }
};
