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

    // Call Google Maps Reverse Geocoding API with high accuracy
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/geocode/json`,
      {
        params: {
          latlng: `${latitude},${longitude}`,
          key: process.env.GOOGLE_MAPS_API_KEY,
          result_type: "street_address|route|establishment" // Request detailed results
        }
      }
    );

    if (response.data.results && response.data.results.length > 0) {
      const result = response.data.results[0]; // Most specific result
      const addressComponents = result.address_components;
      const formattedAddress = result.formatted_address;

      console.log("📍 Reverse Geocode Results:");
      console.log("Full Address:", formattedAddress);
      console.log("Address Components:", JSON.stringify(addressComponents, null, 2));

      // Initialize address data with comprehensive structure
      const addressData = {
        fullAddress: formattedAddress,
        latitude,
        longitude,
        street: "",           // Street number + Route
        building: "",         // Premise/Building name
        area: "",            // Neighborhood/Area (sublocality_level_3 or sublocality_level_2)
        locality: "",        // Locality (sublocality_level_1)
        city: "",            // City (locality or administrative_area_level_3)
        district: "",        // District (administrative_area_level_2)
        state: "",           // State (administrative_area_level_1)
        country: "",         // Country
        pincode: ""          // Postal code
      };

      // Extract all components with proper priority
      let streetNumber = "";
      let route = "";
      let premise = "";
      let neighborhood = "";
      let sublocalityL4 = "";
      let sublocalityL3 = "";
      let sublocalityL2 = "";
      let sublocalityL1 = "";
      let localityCity = "";
      let adminL3 = "";
      let adminL2 = "";
      let adminL1 = "";

      // Parse all address components
      for (const component of addressComponents) {
        const types = component.types;
        const longName = component.long_name;
        const shortName = component.short_name;

        // Street level components
        if (types.includes('premise')) {
          premise = longName;
        } else if (types.includes('street_number')) {
          streetNumber = longName;
        } else if (types.includes('route')) {
          route = longName;
        } else if (types.includes('neighborhood')) {
          neighborhood = longName;
        }

        // Sublocality levels (for Indian addresses, these are important)
        if (types.includes('sublocality_level_4')) {
          sublocalityL4 = longName;
        } else if (types.includes('sublocality_level_3')) {
          sublocalityL3 = longName;
        } else if (types.includes('sublocality_level_2')) {
          sublocalityL2 = longName;
        } else if (types.includes('sublocality_level_1')) {
          sublocalityL1 = longName;
        } else if (types.includes('sublocality')) {
          if (!sublocalityL2) sublocalityL2 = longName;
        }

        // City/locality
        if (types.includes('locality')) {
          localityCity = longName;
        }

        // Administrative areas
        if (types.includes('administrative_area_level_3')) {
          adminL3 = longName;
        } else if (types.includes('administrative_area_level_2')) {
          adminL2 = longName;
        } else if (types.includes('administrative_area_level_1')) {
          adminL1 = shortName || longName;
        }

        // Other components
        if (types.includes('postal_code')) {
          addressData.pincode = longName;
        } else if (types.includes('country')) {
          addressData.country = longName;
        }
      }

      // Build comprehensive street address (most detailed)
      const streetParts = [];
      if (premise) streetParts.push(premise);
      if (streetNumber) streetParts.push(streetNumber);
      if (route) streetParts.push(route);
      if (neighborhood && !streetParts.includes(neighborhood)) streetParts.push(neighborhood);

      addressData.street = streetParts.filter(Boolean).join(", ") || route || streetNumber || premise || neighborhood || "";
      addressData.building = premise;

      // Build area/locality information (combining sublocality levels for complete area info)
      const areaParts = [];
      if (sublocalityL4) areaParts.push(sublocalityL4);
      if (sublocalityL3 && !areaParts.includes(sublocalityL3)) areaParts.push(sublocalityL3);
      if (sublocalityL2 && !areaParts.includes(sublocalityL2)) areaParts.push(sublocalityL2);

      addressData.area = areaParts.filter(Boolean).join(", ") || sublocalityL3 || sublocalityL2 || neighborhood || "";

      // Locality (intermediate level)
      addressData.locality = sublocalityL1 || sublocalityL2 || localityCity || "";

      // City (priority: locality > admin level 3 > sublocalityL1)
      addressData.city = localityCity || adminL3 || sublocalityL1 || "";

      // District (administrative_area_level_2)
      addressData.district = adminL2 || "";

      // State (administrative_area_level_1)
      addressData.state = adminL1 || "";

      console.log("✅ Parsed Address Data:", JSON.stringify(addressData, null, 2));

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
    console.error("❌ Reverse geocode error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to reverse geocode coordinates",
      error: error.message
    });
  }
};