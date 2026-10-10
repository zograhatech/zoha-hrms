const AccountGroup = require('../models/AccountGroup');

const STANDARD_GROUPS = [
    { name: 'Assets', nature: 'Asset' },
    { name: 'Liabilities', nature: 'Liability' },
    { name: 'Income', nature: 'Income' },
    { name: 'Expenses', nature: 'Expense' },

    // Sub-groups for Assets
    { name: 'Bank Accounts', nature: 'Asset', parent: 'Assets' },
    { name: 'Cash-in-Hand', nature: 'Asset', parent: 'Assets' },
    { name: 'Fixed Assets', nature: 'Asset', parent: 'Assets' },
    { name: 'Current Assets', nature: 'Asset', parent: 'Assets' },

    // Sub-groups for Liabilities
    { name: 'Capital Account', nature: 'Liability', parent: 'Liabilities' },
    { name: 'Current Liabilities', nature: 'Liability', parent: 'Liabilities' },
    { name: 'Loans (Liability)', nature: 'Liability', parent: 'Liabilities' },

    // Sub-groups for Expenses
    { name: 'Direct Expenses', nature: 'Expense', parent: 'Expenses' },
    { name: 'Indirect Expenses', nature: 'Expense', parent: 'Expenses' },

    // Sub-groups for Income
    { name: 'Direct Incomes', nature: 'Income', parent: 'Income' },
    { name: 'Indirect Incomes', nature: 'Income', parent: 'Income' },
];

const seedAccountingGroups = async () => {
    try {
        const count = await AccountGroup.countDocuments();
        if (count > 0) return;

        console.log('Seeding standard accounting groups...');

        // First pass: Create primary groups
        for (const g of STANDARD_GROUPS.filter(x => !x.parent)) {
            await AccountGroup.create({ ...g, system_defined: true });
        }

        // Second pass: Create sub-groups
        for (const g of STANDARD_GROUPS.filter(x => x.parent)) {
            const parent = await AccountGroup.findOne({ name: g.parent });
            await AccountGroup.create({
                ...g,
                parent_id: parent._id,
                system_defined: true
            });
        }

        console.log('Accounting groups seeded successfully.');
    } catch (err) {
        console.error('Error seeding accounting groups:', err);
    }
};

module.exports = { seedAccountingGroups };
