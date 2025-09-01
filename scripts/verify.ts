import { seedData } from '../lib/seed-data';
import { Character, Template, Category, Project } from '../lib/types';

function verifyTypes() {
  console.log('🔍 Verifying type definitions and seed data...');

  console.log('\n📊 Characters:');
  seedData.characters.forEach((character, index) => {
    console.log(`  ${index + 1}. ${character.name} (${character.appearance.age}, ${character.appearance.gender})`);
  });

  console.log('\n🎨 Templates:');
  seedData.templates.forEach((template, index) => {
    console.log(`  ${index + 1}. ${template.name} (${template.type}) - ${template.structure.duration}s`);
  });

  console.log('\n📁 Categories:');
  seedData.categories.forEach((category, index) => {
    console.log(`  ${index + 1}. ${category.name} ${category.icon} - Order: ${category.order}`);
  });

  console.log('\n✅ Type verification completed successfully!');

  console.log('\n📋 Summary:');
  console.log(`- Characters: ${seedData.characters.length}`);
  console.log(`- Templates: ${seedData.templates.length}`);  
  console.log(`- Categories: ${seedData.categories.length}`);

  const exampleProject: Omit<Project, 'id' | 'createdAt' | 'updatedAt'> = {
    userId: 'example-user-123',
    title: 'My First Video Project',
    description: 'An example project to test our architecture',
    templateId: 'kids-learning-template',
    characters: [],
    variables: {
      lesson_title: 'Learning About Colors',
      lesson_content: 'Today we will explore the wonderful world of colors!'
    },
    status: 'draft',
    metadata: {
      aspectRatio: '16:9',
      quality: 'standard',
      tags: ['education', 'kids', 'colors']
    },
    collaboration: {
      isPublic: false,
      sharedWith: [],
      permissions: {}
    }
  };

  console.log('\n🚀 Example project structure verified!');
  console.log(`   Title: ${exampleProject.title}`);
  console.log(`   Status: ${exampleProject.status}`);
  console.log(`   Quality: ${exampleProject.metadata.quality}`);
  console.log(`   Aspect Ratio: ${exampleProject.metadata.aspectRatio}`);
}

if (require.main === module) {
  verifyTypes();
}

export default verifyTypes;