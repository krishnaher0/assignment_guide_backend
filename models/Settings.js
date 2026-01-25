import mongoose from 'mongoose';

const settingsSchema = mongoose.Schema({
    key: {
        type: String,
        unique: true,
        required: true,
    },
    value: {
        type: mongoose.Schema.Types.Mixed,
        required: true,
    },
    description: {
        type: String,
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
}, {
    timestamps: true,
});

// Static method to get a setting
settingsSchema.statics.getSetting = async function(key, defaultValue = null) {
    const setting = await this.findOne({ key });
    return setting ? setting.value : defaultValue;
};

// Static method to set a setting
settingsSchema.statics.setSetting = async function(key, value, userId = null, description = null) {
    const update = { value, updatedBy: userId };
    if (description) update.description = description;

    return this.findOneAndUpdate(
        { key },
        update,
        { upsert: true, new: true }
    );
};

const Settings = mongoose.model('Settings', settingsSchema);

export default Settings;
