const Address = require("../models/Address");
const axios = require("axios");

// ============================
// CREATE ADDRESS
// ============================
exports.saveAddress = async (req, res) => {
  try {
    const { userId, fullAddress } = req.body;

    if (!userId || !fullAddress) {
      return res.status(400).json({
        success: false,
        message: "userId and fullAddress are required"
      });
    }

    // ✅ First address auto default
    const existing = await Address.findOne({ userId });
    if (!existing) {
      req.body.isDefault = true;
    }

    // ✅ Only one default
    if (req.body.isDefault) {
      await Address.updateMany(
        { userId },
        { isDefault: false }
      );
    }

    const address = await Address.create(req.body);

    res.status(201).json({
      success: true,
      message: "Address saved successfully",
      data: address
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to save address",
      error: err.message
    });
  }
};



// ============================
// GET USER ADDRESSES
// ============================
exports.getUserAddresses = async (req, res) => {
  try {
    const data = await Address.find({
      userId: req.params.userId
    }).sort({ isDefault: -1, createdAt: -1 });

    res.json({
      success: true,
      data
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};



// ============================
// GET DEFAULT ADDRESS
// ============================
exports.getDefaultAddress = async (req, res) => {
  try {
    const address = await Address.findOne({
      userId: req.params.userId,
      isDefault: true
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: "No default address found"
      });
    }

    res.json({
      success: true,
      data: address
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};



// ============================
// UPDATE ADDRESS
// ============================
exports.updateAddress = async (req, res) => {
  try {
    const address = await Address.findById(req.params.id);

    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found"
      });
    }

    // ✅ Handle default switch
    if (req.body.isDefault) {
      await Address.updateMany(
        { userId: address.userId },
        { isDefault: false }
      );
    }

    const updated = await Address.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    res.json({
      success: true,
      message: "Address updated",
      data: updated
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};



// ============================
// DELETE ADDRESS
// ============================
exports.deleteAddress = async (req, res) => {
  try {
    const address = await Address.findById(req.params.id);

    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found"
      });
    }

    // ❌ Prevent deleting default
    if (address.isDefault) {
      return res.status(400).json({
        success: false,
        message: "Default address cannot be deleted"
      });
    }

    // ✅ Ensure at least one remains
    const count = await Address.countDocuments({
      userId: address.userId
    });

    if (count <= 1) {
      return res.status(400).json({
        success: false,
        message: "At least one address is required"
      });
    }

    await Address.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Address deleted successfully"
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};



// ============================
// REVERSE GEOCODE (GPS → Address)
// ============================
exports.reverseGeocode = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: "Latitude and longitude are required"
      });
    }

    if (!process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY === 'your_google_maps_api_key_here') {
      return res.status(500).json({
        success: false,
        message: "Google Maps API key not configured. Please add GOOGLE_MAPS_API_KEY to .env"
      });
    }

    // Call Google Maps Reverse Geocoding API
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/geocode/json`,
      {
        params: {
          latlng: `${latitude},${longitude}`,
          key: process.env.GOOGLE_MAPS_API_KEY
        }
      }
    );

    if (response.data.results && response.data.results.length > 0) {
      const result = response.data.results[0];
      const addressComponents = result.address_components;

      // Extract address components from Google's response
      const addressData = {
        fullAddress: result.formatted_address,
        latitude,
        longitude,
        street: "",
        area: "",
        city: "",
        state: "",
        country: "",
        pincode: ""
      };

      // Parse address components
      for (const component of addressComponents) {
        const types = component.types;
        const longName = component.long_name;
        const shortName = component.short_name;

        if (types.includes('street_number')) {
          addressData.street = longName;
        } else if (types.includes('route') && !addressData.street) {
          addressData.street = longName;
        } else if (types.includes('locality')) {
          addressData.city = longName;
        } else if (types.includes('administrative_area_level_2')) {
          addressData.area = longName;
        } else if (types.includes('administrative_area_level_1')) {
          addressData.state = shortName;
        } else if (types.includes('country')) {
          addressData.country = longName;
        } else if (types.includes('postal_code')) {
          addressData.pincode = longName;
        }
      }

      // Refine street address: combine street_number and route
      if (!addressData.street || addressData.street.length < 3) {
        const streetNumber = addressComponents.find(c => c.types.includes('street_number'));
        const route = addressComponents.find(c => c.types.includes('route'));
        if (streetNumber && route) {
          addressData.street = `${streetNumber.long_name} ${route.long_name}`;
        } else if (route) {
          addressData.street = route.long_name;
        }
      }

      // If city is empty, try to use sublocality
      if (!addressData.city) {
        const sublocality = addressComponents.find(c => c.types.includes('sublocality_level_1'));
        if (sublocality) {
          addressData.city = sublocality.long_name;
        }
      }

      res.json({
        success: true,
        data: addressData
      });
    } else {
      res.status(404).json({
        success: false,
        message: "Address not found for the given coordinates"
      });
    }
  } catch (error) {
    console.error("Reverse geocode error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to reverse geocode coordinates",
      error: error.message
    });
  }
};