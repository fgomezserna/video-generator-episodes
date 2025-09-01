import { CharactersDB, TemplatesDB, CategoriesDB } from '../lib/db';
import { seedData } from '../lib/seed-data';

async function seedDatabase() {
  console.log('🌱 Starting database seeding...');

  try {
    console.log('📦 Seeding characters...');
    for (const character of seedData.characters) {
      const characterId = await CharactersDB.create(character);
      console.log(`✅ Created character: ${character.name} (${characterId})`);
    }

    console.log('📝 Seeding categories...');
    const categoryIds: { [name: string]: string } = {};
    for (const category of seedData.categories) {
      const categoryId = await CategoriesDB.create(category);
      categoryIds[category.name] = categoryId;
      console.log(`✅ Created category: ${category.name} (${categoryId})`);
    }

    console.log('🎨 Seeding templates...');
    for (const template of seedData.templates) {
      const templateId = await TemplatesDB.create(template);
      console.log(`✅ Created template: ${template.name} (${templateId})`);

      const categoryName = getCategoryForTemplate(template.type);
      if (categoryName && categoryIds[categoryName]) {
        await CategoriesDB.addTemplate(categoryIds[categoryName], templateId);
        console.log(`🔗 Added template ${template.name} to category ${categoryName}`);
      }
    }

    console.log('🎉 Database seeding completed successfully!');
    console.log(`
📊 Summary:
- Characters: ${seedData.characters.length}
- Templates: ${seedData.templates.length}
- Categories: ${seedData.categories.length}
    `);

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
}

function getCategoryForTemplate(templateType: string): string | null {
  const typeToCategory: { [key: string]: string } = {
    'kids': 'Kids',
    'marketing': 'Marketing',
    'documentary': 'Documentary',
    'educational': 'Education'
  };

  return typeToCategory[templateType] || null;
}

if (require.main === module) {
  seedDatabase().then(() => process.exit(0));
}

export default seedDatabase;